package tunnel

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// Session 一条 Agent↔Controller 的隧道会话(基于 WebSocket)。
type Session struct {
	AgentID   string
	Connected time.Time

	conn *websocket.Conn
	// writeMu 保护 WriteMessage
	writeMu sync.Mutex

	// streams stream_id → pipe
	streamsMu sync.Mutex
	streams   map[uint32]*streamPipe
	nextID    atomic.Uint32

	// onClose 会话断开回调
	onClose func(agentID string, session *Session)

	closed    chan struct{}
	closeOnce sync.Once

	// 等待 open 结果
	pendingMu sync.Mutex
	pending   map[uint32]chan openResult
}

type openResult struct {
	ok     bool
	reason string
}

// NewSession 从已 Upgrade 的 WS 构造会话。
func NewSession(agentID string, conn *websocket.Conn, onClose func(string, *Session)) *Session {
	s := &Session{
		AgentID:   agentID,
		Connected: time.Now(),
		conn:      conn,
		streams:   make(map[uint32]*streamPipe),
		pending:   make(map[uint32]chan openResult),
		onClose:   onClose,
		closed:    make(chan struct{}),
	}
	s.nextID.Store(1)
	return s
}

// Run 读循环,阻塞直到连接结束。
func (s *Session) Run() {
	defer s.Close()
	// 读超时 + ping
	_ = s.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	s.conn.SetPongHandler(func(string) error {
		_ = s.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	// 应用层 ping
	go s.pingLoop()

	for {
		mt, r, err := s.conn.NextReader()
		if err != nil {
			return
		}
		if mt != websocket.BinaryMessage && mt != websocket.TextMessage {
			continue
		}
		// 每条 WS 消息对应一帧协议
		fr, err := decodeFrame(r)
		if err != nil {
			if err != io.EOF && err != io.ErrUnexpectedEOF {
				log.Printf("[tunnel] decode frame: %v", err)
			}
			return
		}
		s.handleFrame(fr)
	}
}

func (s *Session) pingLoop() {
	t := time.NewTicker(25 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-s.closed:
			return
		case <-t.C:
			if err := s.writeFrame(TypePing, 0, nil); err != nil {
				return
			}
		}
	}
}

func (s *Session) handleFrame(fr Frame) {
	switch fr.Type {
	case TypePong, TypePing:
		if fr.Type == TypePing {
			_ = s.writeFrame(TypePong, 0, nil)
		}
		_ = s.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	case TypeData:
		s.streamsMu.Lock()
		pipe := s.streams[fr.StreamID]
		s.streamsMu.Unlock()
		if pipe != nil {
			pipe.push(fr.Payload)
		}
	case TypeClose:
		s.streamsMu.Lock()
		pipe := s.streams[fr.StreamID]
		delete(s.streams, fr.StreamID)
		s.streamsMu.Unlock()
		if pipe != nil {
			// 不回调 closeFn,避免循环
			pipe.closeOnce.Do(func() { close(pipe.closed) })
		}
		s.failPending(fr.StreamID, "closed")
	case TypeOpenOK:
		s.resolvePending(fr.StreamID, true, "")
	case TypeOpenFail:
		reason := "open failed"
		var fp FailPayload
		if json.Unmarshal(fr.Payload, &fp) == nil && fp.Reason != "" {
			reason = fp.Reason
		}
		s.resolvePending(fr.StreamID, false, reason)
		s.removeStream(fr.StreamID)
	case TypeOpen:
		// Controller 侧不应收到 open;Agent 侧在 AgentSession 处理
	case TypeHello, TypeHelloAck:
		// 握手在 Accept 阶段完成
	default:
		// ignore
	}
}

func (s *Session) resolvePending(id uint32, ok bool, reason string) {
	s.pendingMu.Lock()
	ch := s.pending[id]
	delete(s.pending, id)
	s.pendingMu.Unlock()
	if ch != nil {
		select {
		case ch <- openResult{ok: ok, reason: reason}:
		default:
		}
	}
}

func (s *Session) failPending(id uint32, reason string) {
	s.resolvePending(id, false, reason)
}

func (s *Session) removeStream(id uint32) {
	s.streamsMu.Lock()
	delete(s.streams, id)
	s.streamsMu.Unlock()
}

func (s *Session) writeFrame(t byte, streamID uint32, payload []byte) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	select {
	case <-s.closed:
		return io.ErrClosedPipe
	default:
	}
	return s.conn.WriteMessage(websocket.BinaryMessage, encodeFrame(t, streamID, payload))
}

// OpenRemote 在 Agent 侧打开到 remote 的连接,返回可读写的 pipe。
func (s *Session) OpenRemote(remoteHost string, remotePort int, timeout time.Duration) (io.ReadWriteCloser, error) {
	if timeout <= 0 {
		timeout = DefaultDialTimeout + 5*time.Second
	}
	id := s.nextID.Add(1)
	pipe := newStreamPipe(id, func(sid uint32, p []byte) error {
		return s.writeFrame(TypeData, sid, p)
	}, func(sid uint32) {
		_ = s.writeFrame(TypeClose, sid, marshalJSON(FailPayload{Reason: "local close"}))
		s.removeStream(sid)
	})

	s.streamsMu.Lock()
	s.streams[id] = pipe
	s.streamsMu.Unlock()

	ch := make(chan openResult, 1)
	s.pendingMu.Lock()
	s.pending[id] = ch
	s.pendingMu.Unlock()

	payload := marshalJSON(OpenPayload{RemoteHost: remoteHost, RemotePort: remotePort})
	if err := s.writeFrame(TypeOpen, id, payload); err != nil {
		s.removeStream(id)
		s.pendingMu.Lock()
		delete(s.pending, id)
		s.pendingMu.Unlock()
		return nil, err
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-s.closed:
		return nil, fmt.Errorf("session closed")
	case <-timer.C:
		s.failPending(id, "timeout")
		_ = pipe.Close()
		return nil, fmt.Errorf("open remote timeout")
	case res := <-ch:
		if !res.ok {
			_ = pipe.Close()
			return nil, fmt.Errorf("open remote: %s", res.reason)
		}
		return pipe, nil
	}
}

// ActiveStreams 当前 stream 数。
func (s *Session) ActiveStreams() int {
	s.streamsMu.Lock()
	defer s.streamsMu.Unlock()
	return len(s.streams)
}

// Close 关闭会话。
func (s *Session) Close() {
	s.closeOnce.Do(func() {
		close(s.closed)
		s.streamsMu.Lock()
		streams := make([]*streamPipe, 0, len(s.streams))
		for _, p := range s.streams {
			streams = append(streams, p)
		}
		s.streams = make(map[uint32]*streamPipe)
		s.streamsMu.Unlock()
		// stream Close 回调会访问 streamsMu，必须在锁外触发。
		for _, p := range streams {
			p.closeOnce.Do(func() { close(p.closed) })
		}
		_ = s.conn.Close()
		if s.onClose != nil {
			s.onClose(s.AgentID, s)
		}
	})
}

// ----- Agent 侧会话:处理 open 并 dial -----

// AgentSession Agent 端读循环:响应 open/ping。
type AgentSession struct {
	conn      *websocket.Conn
	writeMu   sync.Mutex
	streamsMu sync.Mutex
	streams   map[uint32]*streamPipe
	allowAny  bool
	closed    chan struct{}
	closeOnce sync.Once
}

// NewAgentSession 构造。
func NewAgentSession(conn *websocket.Conn, allowAnyRemote bool) *AgentSession {
	return &AgentSession{
		conn:     conn,
		streams:  make(map[uint32]*streamPipe),
		allowAny: allowAnyRemote,
		closed:   make(chan struct{}),
	}
}

// Run 阻塞读循环。
func (a *AgentSession) Run() {
	defer a.Close()
	_ = a.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	a.conn.SetPongHandler(func(string) error {
		_ = a.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})
	go a.pingLoop()

	for {
		mt, r, err := a.conn.NextReader()
		if err != nil {
			return
		}
		if mt != websocket.BinaryMessage && mt != websocket.TextMessage {
			continue
		}
		fr, err := decodeFrame(r)
		if err != nil {
			return
		}
		a.handleFrame(fr)
	}
}

func (a *AgentSession) pingLoop() {
	t := time.NewTicker(25 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-a.closed:
			return
		case <-t.C:
			_ = a.writeFrame(TypePing, 0, nil)
		}
	}
}

func (a *AgentSession) handleFrame(fr Frame) {
	switch fr.Type {
	case TypePing:
		_ = a.writeFrame(TypePong, 0, nil)
		_ = a.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	case TypePong:
		_ = a.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	case TypeOpen:
		go a.handleOpen(fr.StreamID, fr.Payload)
	case TypeData:
		a.streamsMu.Lock()
		pipe := a.streams[fr.StreamID]
		a.streamsMu.Unlock()
		if pipe != nil {
			pipe.push(fr.Payload)
		}
	case TypeClose:
		a.streamsMu.Lock()
		pipe := a.streams[fr.StreamID]
		delete(a.streams, fr.StreamID)
		a.streamsMu.Unlock()
		if pipe != nil {
			pipe.closeOnce.Do(func() { close(pipe.closed) })
		}
	}
}

func (a *AgentSession) handleOpen(streamID uint32, payload []byte) {
	var op OpenPayload
	if err := json.Unmarshal(payload, &op); err != nil {
		_ = a.writeFrame(TypeOpenFail, streamID, marshalJSON(FailPayload{Reason: "bad open payload"}))
		return
	}
	if op.RemotePort <= 0 || op.RemotePort > 65535 {
		_ = a.writeFrame(TypeOpenFail, streamID, marshalJSON(FailPayload{Reason: "invalid remote port"}))
		return
	}
	if !IsAllowedRemote(op.RemoteHost, a.allowAny) {
		_ = a.writeFrame(TypeOpenFail, streamID, marshalJSON(FailPayload{Reason: "remote host not allowed"}))
		return
	}
	addr := net.JoinHostPort(op.RemoteHost, fmt.Sprintf("%d", op.RemotePort))
	c, err := net.DialTimeout("tcp", addr, DefaultDialTimeout)
	if err != nil {
		_ = a.writeFrame(TypeOpenFail, streamID, marshalJSON(FailPayload{Reason: err.Error()}))
		return
	}
	pipe := newStreamPipe(streamID, func(sid uint32, p []byte) error {
		return a.writeFrame(TypeData, sid, p)
	}, func(sid uint32) {
		_ = a.writeFrame(TypeClose, sid, marshalJSON(FailPayload{Reason: "agent close"}))
		a.streamsMu.Lock()
		delete(a.streams, sid)
		a.streamsMu.Unlock()
	})
	a.streamsMu.Lock()
	a.streams[streamID] = pipe
	a.streamsMu.Unlock()

	if err := a.writeFrame(TypeOpenOK, streamID, nil); err != nil {
		_ = c.Close()
		_ = pipe.Close()
		return
	}
	// 桥接:远端 TCP ↔ stream pipe
	Bridge(pipe, c)
}

func (a *AgentSession) writeFrame(t byte, streamID uint32, payload []byte) error {
	a.writeMu.Lock()
	defer a.writeMu.Unlock()
	select {
	case <-a.closed:
		return io.ErrClosedPipe
	default:
	}
	return a.conn.WriteMessage(websocket.BinaryMessage, encodeFrame(t, streamID, payload))
}

// Close 关闭。
func (a *AgentSession) Close() {
	a.closeOnce.Do(func() {
		close(a.closed)
		a.streamsMu.Lock()
		streams := make([]*streamPipe, 0, len(a.streams))
		for _, p := range a.streams {
			streams = append(streams, p)
		}
		a.streams = make(map[uint32]*streamPipe)
		a.streamsMu.Unlock()
		// stream Close 回调会访问 streamsMu，必须在锁外触发。
		for _, p := range streams {
			p.closeOnce.Do(func() { close(p.closed) })
		}
		_ = a.conn.Close()
	})
}
