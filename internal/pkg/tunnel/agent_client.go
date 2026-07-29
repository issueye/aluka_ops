package tunnel

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"aluka_ops/internal/version"
)

// AgentClient Agent 侧:主动连接 Controller 隧道 WS,断线重连。
type AgentClient struct {
	controllerURL string // 如 http://ctrl:19090
	agentID       string
	token         string
	allowAny      bool

	mu     sync.Mutex
	stopCh chan struct{}
	stopped bool
}

// NewAgentClient 构造。
func NewAgentClient(controllerURL, agentID, token string, allowAnyRemote bool) *AgentClient {
	return &AgentClient{
		controllerURL: strings.TrimRight(controllerURL, "/"),
		agentID:       agentID,
		token:         token,
		allowAny:      allowAnyRemote,
		stopCh:        make(chan struct{}),
	}
}

// Start 后台重连循环。
func (c *AgentClient) Start() {
	if c == nil || c.controllerURL == "" || c.agentID == "" {
		return
	}
	go c.loop()
}

// Stop 停止。
func (c *AgentClient) Stop() {
	c.mu.Lock()
	if c.stopped {
		c.mu.Unlock()
		return
	}
	c.stopped = true
	close(c.stopCh)
	c.mu.Unlock()
}

func (c *AgentClient) loop() {
	backoff := time.Second
	for {
		select {
		case <-c.stopCh:
			return
		default:
		}
		err := c.connectOnce()
		if err != nil {
			log.Printf("[tunnel-agent] disconnected: %v; retry in %s", err, backoff)
		}
		select {
		case <-c.stopCh:
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
		}
		// 成功连接过再重置 backoff:connectOnce 返回则已断,保持退避
	}
}

func (c *AgentClient) connectOnce() error {
	wsURL, err := toWSURL(c.controllerURL, "/api/tunnel/ws")
	if err != nil {
		return err
	}
	q := wsURL.Query()
	q.Set("agent_id", c.agentID)
	if c.token != "" {
		q.Set("token", c.token)
	}
	wsURL.RawQuery = q.Encode()

	hdr := http.Header{}
	if c.token != "" {
		hdr.Set("X-Agent-Token", c.token)
	}
	hdr.Set("X-Agent-Id", c.agentID)

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}
	conn, resp, err := dialer.Dial(wsURL.String(), hdr)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("dial %s: %w (http %d)", wsURL.String(), err, resp.StatusCode)
		}
		return fmt.Errorf("dial %s: %w", wsURL.String(), err)
	}
	defer conn.Close()

	// 发送 hello
	hello := marshalJSON(HelloPayload{
		AgentID: c.agentID,
		Version: version.AppVersion,
		Token:   c.token,
		Caps:    "reverse_tcp",
	})
	if err := conn.WriteMessage(websocket.BinaryMessage, encodeFrame(TypeHello, 0, hello)); err != nil {
		return err
	}
	// 读 hello_ack
	_ = conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	_, _, err = conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("hello_ack: %w", err)
	}
	_ = conn.SetReadDeadline(time.Time{})

	log.Printf("[tunnel-agent] connected to %s as %s", c.controllerURL, c.agentID)
	sess := NewAgentSession(conn, c.allowAny)
	// 用 stopCh 打断:关闭 conn
	go func() {
		select {
		case <-c.stopCh:
			sess.Close()
		}
	}()
	sess.Run()
	return fmt.Errorf("session ended")
}

func toWSURL(base, path string) (*url.URL, error) {
	u, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
		// ok
	default:
		return nil, fmt.Errorf("unsupported scheme: %s", u.Scheme)
	}
	u.Path = strings.TrimRight(u.Path, "/") + path
	return u, nil
}
