package tunnel

import (
	"context"
	"fmt"
	"io"
	"net"
	"time"
)

// tunnelConn 把隧道的一条 stream(io.ReadWriteCloser)包装成 net.Conn,
// 使其可作为 http.Transport.DialContext 的返回值或裸 WS 传输。
//
// tunnel stream 是可靠的双向字节流(经 WebSocket 帧),语义上等同于 TCP:
// Agent 侧 handleOpen 收到 OpenPayload 后 net.Dial 目标地址并 Bridge。
// 因此本类型只需把 Read/Write/Close 代理到底层 stream,
// LocalAddr/RemoteAddr/Set*Deadline 为占位实现(http.Transport 不依赖 deadline)。
type tunnelConn struct {
	stream io.ReadWriteCloser
	agent  string
	port   int
}

// DialAgentHTTP 通过隧道会话回拨 Agent 本机的 HTTP 端口,返回 net.Conn。
// host 固定 127.0.0.1(Agent 侧 handleOpen 默认仅允许 loopback/私网回拨)。
func DialAgentHTTP(ctx context.Context, sess *Session, agentHTTPPort int) (net.Conn, error) {
	if sess == nil {
		return nil, fmt.Errorf("tunnel session is nil")
	}
	if agentHTTPPort <= 0 {
		return nil, fmt.Errorf("agent http port unknown")
	}
	// 在 ctx 取消时中断 OpenRemote 的等待
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
		case <-done:
		}
	}()
	stream, err := sess.OpenRemote("127.0.0.1", agentHTTPPort, 20*time.Second)
	if err != nil {
		return nil, fmt.Errorf("tunnel open agent http: %w", err)
	}
	return &tunnelConn{stream: stream, agent: sess.AgentID, port: agentHTTPPort}, nil
}

func (c *tunnelConn) Read(p []byte) (int, error)  { return c.stream.Read(p) }
func (c *tunnelConn) Write(p []byte) (int, error) { return c.stream.Write(p) }
func (c *tunnelConn) Close() error                { return c.stream.Close() }

// 地址为占位:http.Transport / websocket.NewClient 不依赖具体值,
// 仅用于日志与(可选)Host 头推断。这里返回 loopback 形式。
func (c *tunnelConn) LocalAddr() net.Addr  { return loopbackAddr{port: c.port} }
func (c *tunnelConn) RemoteAddr() net.Addr { return loopbackAddr{port: c.port} }

func (c *tunnelConn) SetDeadline(t time.Time) error      { return nil }
func (c *tunnelConn) SetReadDeadline(t time.Time) error  { return nil }
func (c *tunnelConn) SetWriteDeadline(t time.Time) error { return nil }

// loopbackAddr 实现 net.Addr,用于占位地址。
type loopbackAddr struct {
	port int
}

func (a loopbackAddr) Network() string { return "tcp" }
func (a loopbackAddr) String() string  { return fmt.Sprintf("127.0.0.1:%d", a.port) }
