// Package tunnel 实现中心中继的反向 TCP 流量隧道。
//
// 传输:Agent → Controller 的 WebSocket 长连接。
// 帧格式(二进制):
//
//	type(1) | stream_id(4 BE) | length(4 BE) | payload(length)
//
// type: hello=1, hello_ack=2, open=3, open_ok=4, open_fail=5, data=6, close=7, ping=8, pong=9
package tunnel

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"
)

const (
	TypeHello    byte = 1
	TypeHelloAck byte = 2
	TypeOpen     byte = 3
	TypeOpenOK   byte = 4
	TypeOpenFail byte = 5
	TypeData     byte = 6
	TypeClose    byte = 7
	TypePing     byte = 8
	TypePong     byte = 9

	// MaxFramePayload 单帧最大 payload(防 OOM)
	MaxFramePayload = 1 << 20 // 1MB
	// DefaultDialTimeout Agent 拨号远端超时
	DefaultDialTimeout = 10 * time.Second
)

// Frame 一条协议帧。
type Frame struct {
	Type     byte
	StreamID uint32
	Payload  []byte
}

// HelloPayload Agent 握手。
type HelloPayload struct {
	AgentID  string `json:"agent_id"`
	Version  string `json:"version,omitempty"`
	Host     string `json:"host,omitempty"`
	Token    string `json:"token,omitempty"`
	Caps     string `json:"caps,omitempty"`
}

// OpenPayload 中心请求 Agent 拨号。
type OpenPayload struct {
	RemoteHost string `json:"remote_host"`
	RemotePort int    `json:"remote_port"`
}

// FailPayload open_fail / close 原因。
type FailPayload struct {
	Reason string `json:"reason"`
}

func encodeFrame(t byte, streamID uint32, payload []byte) []byte {
	if payload == nil {
		payload = []byte{}
	}
	buf := make([]byte, 9+len(payload))
	buf[0] = t
	binary.BigEndian.PutUint32(buf[1:5], streamID)
	binary.BigEndian.PutUint32(buf[5:9], uint32(len(payload)))
	copy(buf[9:], payload)
	return buf
}

func decodeFrame(r io.Reader) (Frame, error) {
	var hdr [9]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return Frame{}, err
	}
	t := hdr[0]
	sid := binary.BigEndian.Uint32(hdr[1:5])
	n := binary.BigEndian.Uint32(hdr[5:9])
	if n > MaxFramePayload {
		return Frame{}, fmt.Errorf("frame too large: %d", n)
	}
	var payload []byte
	if n > 0 {
		payload = make([]byte, n)
		if _, err := io.ReadFull(r, payload); err != nil {
			return Frame{}, err
		}
	}
	return Frame{Type: t, StreamID: sid, Payload: payload}, nil
}

func marshalJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// IsAllowedRemote 默认仅允许 loopback 与私网,降低 SSRF 风险。
func IsAllowedRemote(host string, allowAny bool) bool {
	host = strings.TrimSpace(host)
	if host == "" {
		return false
	}
	if allowAny {
		return true
	}
	h := strings.ToLower(host)
	if h == "localhost" || h == "127.0.0.1" || h == "::1" || h == "0:0:0:0:0:0:0:1" {
		return true
	}
	// 去掉可能的方括号 IPv6
	h = strings.Trim(h, "[]")
	ip := net.ParseIP(h)
	if ip == nil {
		// 主机名:仅允许明确的 localhost 类;其它主机名默认拒绝
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
		return true
	}
	return false
}

// Bridge 双向拷贝并在结束时关闭两侧。
func Bridge(a, b io.ReadWriteCloser) {
	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = a.Close()
			_ = b.Close()
		})
	}
	done := make(chan struct{}, 2)
	go func() {
		_, _ = io.Copy(a, b)
		done <- struct{}{}
	}()
	go func() {
		_, _ = io.Copy(b, a)
		done <- struct{}{}
	}()
	<-done
	closeBoth()
	<-done
}

// streamPipe 把隧道 stream 模拟成 net.Conn 半双工读写(经 channel)。
type streamPipe struct {
	id     uint32
	readCh chan []byte
	// leftover 未读完的缓冲
	leftover []byte
	writeFn  func(id uint32, p []byte) error
	closeFn  func(id uint32)
	closed   chan struct{}
	closeOnce sync.Once
	mu       sync.Mutex
}

func newStreamPipe(id uint32, writeFn func(uint32, []byte) error, closeFn func(uint32)) *streamPipe {
	return &streamPipe{
		id:      id,
		readCh:  make(chan []byte, 32),
		writeFn: writeFn,
		closeFn: closeFn,
		closed:  make(chan struct{}),
	}
}

func (s *streamPipe) push(p []byte) {
	select {
	case <-s.closed:
		return
	default:
	}
	// 拷贝一份,避免上层复用 buffer
	cp := make([]byte, len(p))
	copy(cp, p)
	select {
	case s.readCh <- cp:
	case <-s.closed:
	}
}

func (s *streamPipe) Read(p []byte) (int, error) {
	if len(s.leftover) > 0 {
		n := copy(p, s.leftover)
		s.leftover = s.leftover[n:]
		return n, nil
	}
	select {
	case <-s.closed:
		return 0, io.EOF
	case b, ok := <-s.readCh:
		if !ok {
			return 0, io.EOF
		}
		n := copy(p, b)
		if n < len(b) {
			s.leftover = b[n:]
		}
		return n, nil
	}
}

func (s *streamPipe) Write(p []byte) (int, error) {
	select {
	case <-s.closed:
		return 0, io.ErrClosedPipe
	default:
	}
	if err := s.writeFn(s.id, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

func (s *streamPipe) Close() error {
	s.closeOnce.Do(func() {
		close(s.closed)
		if s.closeFn != nil {
			s.closeFn(s.id)
		}
	})
	return nil
}
