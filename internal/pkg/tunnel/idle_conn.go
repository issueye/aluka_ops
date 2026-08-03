package tunnel

import (
	"net"
	"time"
)

// idleTimeoutConn 将固定连接期限转换为滑动空闲超时。
// 任一方向成功传输数据都会同时刷新读写 deadline，适合 WebSocket 等长连接。
type idleTimeoutConn struct {
	net.Conn
	timeout time.Duration
}

func newIdleTimeoutConn(conn net.Conn, timeout time.Duration) net.Conn {
	if conn == nil || timeout <= 0 {
		return conn
	}
	c := &idleTimeoutConn{Conn: conn, timeout: timeout}
	c.refreshDeadline()
	return c
}

func (c *idleTimeoutConn) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	if n > 0 {
		c.refreshDeadline()
	}
	return n, err
}

func (c *idleTimeoutConn) Write(p []byte) (int, error) {
	n, err := c.Conn.Write(p)
	if n > 0 {
		c.refreshDeadline()
	}
	return n, err
}

func (c *idleTimeoutConn) refreshDeadline() {
	_ = c.Conn.SetDeadline(time.Now().Add(c.timeout))
}
