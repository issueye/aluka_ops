package tunnel

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"aluka_ops/internal/model"
)

// RuleRuntime 规则运行时状态。
type RuleRuntime struct {
	RuleID       uint   `json:"rule_id"`
	ListenAddr   string `json:"listen_addr"`
	Listening    bool   `json:"listening"`
	WaitingAgent bool   `json:"waiting_agent"`
	Error        string `json:"error,omitempty"`
	ActiveConns  int64  `json:"active_conns"`
	TotalConns   int64  `json:"total_conns"`
	AgentOnline  bool   `json:"agent_online"`
}

// SessionInfo 会话摘要。
type SessionInfo struct {
	AgentID       string    `json:"agent_id"`
	ConnectedAt   time.Time `json:"connected_at"`
	ActiveStreams int       `json:"active_streams"`
}

// Hub Controller 侧隧道中枢:管理 Agent 会话与反向 TCP 监听。
type Hub struct {
	mu       sync.RWMutex
	sessions map[string]*Session // agent_id → session
	// rules 当前生效规则
	rules map[uint]model.TunnelRule
	// listeners rule_id → listener state
	listeners map[uint]*ruleListener

	token    string
	upgrader websocket.Upgrader
	// allowRemoteAny 是否允许 Agent 拨非私网地址
	allowRemoteAny bool

	closed chan struct{}
}

type ruleListener struct {
	rule    model.TunnelRule
	ln      net.Listener
	stop    chan struct{}
	active  atomic.Int64
	total   atomic.Int64
	lastErr string
	running bool
}

// NewHub 构造。
func NewHub(agentToken string, allowOrigin string) *Hub {
	h := &Hub{
		sessions:  make(map[string]*Session),
		rules:     make(map[uint]model.TunnelRule),
		listeners: make(map[uint]*ruleListener),
		token:     agentToken,
		closed:    make(chan struct{}),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				// Agent 非浏览器,放宽;若需严格可对 allowOrigin 校验
				return true
			},
		},
	}
	return h
}

// SetAllowRemoteAny 配置 SSRF 策略(透传给 Agent 侧,中心仅记录)。
func (h *Hub) SetAllowRemoteAny(v bool) { h.allowRemoteAny = v }

// SetToken 运行时更新 Agent 共享密钥(前端改配置后同步)。
func (h *Hub) SetToken(token string) {
	if h == nil {
		return
	}
	h.mu.Lock()
	h.token = token
	h.mu.Unlock()
}

// Token 当前密钥(可能为空表示不校验)。
func (h *Hub) Token() string {
	if h == nil {
		return ""
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.token
}

// HandleWS Gin/HTTP 入口:Agent 拨号升级。
// Query/Header: agent_id, token(X-Agent-Token 或 agent_token)。
func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	agentID := strings.TrimSpace(r.URL.Query().Get("agent_id"))
	if agentID == "" {
		agentID = strings.TrimSpace(r.Header.Get("X-Agent-Id"))
	}
	token := strings.TrimSpace(r.Header.Get("X-Agent-Token"))
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	want := h.Token()
	if want != "" && token != want {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if agentID == "" {
		http.Error(w, "agent_id required", http.StatusBadRequest)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	// 读 hello(可选,兼容无 hello 直接用 query)
	_ = conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	mt, data, err := conn.ReadMessage()
	if err != nil {
		_ = conn.Close()
		return
	}
	_ = conn.SetReadDeadline(time.Time{})

	if mt == websocket.BinaryMessage && len(data) >= 9 && data[0] == TypeHello {
		fr, err := decodeFrame(bytes.NewReader(data))
		if err == nil {
			var hp HelloPayload
			_ = json.Unmarshal(fr.Payload, &hp)
			if hp.AgentID != "" {
				agentID = hp.AgentID
			}
			if want != "" && hp.Token != "" && hp.Token != want {
				_ = conn.WriteMessage(websocket.BinaryMessage, encodeFrame(TypeOpenFail, 0, marshalJSON(FailPayload{Reason: "bad token"})))
				_ = conn.Close()
				return
			}
		}
	}

	// hello_ack
	_ = conn.WriteMessage(websocket.BinaryMessage, encodeFrame(TypeHelloAck, 0, marshalJSON(map[string]any{
		"ok":       true,
		"server":   "aluka_ops",
		"agent_id": agentID,
	})))

	sess := NewSession(agentID, conn, h.onSessionClose)
	h.mu.Lock()
	old := h.sessions[agentID]
	h.sessions[agentID] = sess
	h.mu.Unlock()
	// Session.Close 会回调 Hub，必须在释放 h.mu 后关闭旧会话。
	if old != nil {
		old.Close()
	}

	log.Printf("[tunnel] agent connected: %s", agentID)
	// 该 Agent 的规则补 Listen
	h.ensureListenersForAgent(agentID)

	sess.Run() // 阻塞直到断开
}

func (h *Hub) onSessionClose(agentID string, session *Session) {
	h.mu.Lock()
	if cur, ok := h.sessions[agentID]; ok && cur == session {
		// 旧连接被新连接替换时，不得删除刚注册的新 session。
		delete(h.sessions, agentID)
	}
	// 不停 listener,标记 waiting;已有连接会因 session 关闭失败
	h.mu.Unlock()
	log.Printf("[tunnel] agent disconnected: %s", agentID)
}

// GetSession 获取在线会话。
func (h *Hub) GetSession(agentID string) (*Session, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	s, ok := h.sessions[agentID]
	return s, ok
}

// ListSessions 会话列表。
func (h *Hub) ListSessions() []SessionInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]SessionInfo, 0, len(h.sessions))
	for id, s := range h.sessions {
		out = append(out, SessionInfo{
			AgentID:       id,
			ConnectedAt:   s.Connected,
			ActiveStreams: s.ActiveStreams(),
		})
	}
	return out
}

// ApplyRules 用完整规则集替换并刷新 listener。
func (h *Hub) ApplyRules(rules []model.TunnelRule) {
	h.mu.Lock()
	// 新 map
	next := make(map[uint]model.TunnelRule, len(rules))
	enabledIDs := map[uint]struct{}{}
	for _, r := range rules {
		if r.Mode == "" {
			r.Mode = model.TunnelModeReverseTCP
		}
		next[r.ID] = r
		if r.Enabled && r.Mode == model.TunnelModeReverseTCP {
			enabledIDs[r.ID] = struct{}{}
		}
	}
	h.rules = next

	// 停掉已删除或禁用的
	for id, rl := range h.listeners {
		if _, ok := enabledIDs[id]; !ok {
			h.stopListenerLocked(rl)
			delete(h.listeners, id)
		}
	}
	h.mu.Unlock()

	// 启动/更新启用规则
	for id := range enabledIDs {
		h.ensureListener(id)
	}
}

func (h *Hub) ensureListenersForAgent(agentID string) {
	h.mu.RLock()
	var ids []uint
	for id, r := range h.rules {
		if r.Enabled && r.AgentID == agentID {
			ids = append(ids, id)
		}
	}
	h.mu.RUnlock()
	for _, id := range ids {
		h.ensureListener(id)
	}
}

func (h *Hub) ensureListener(ruleID uint) {
	h.mu.Lock()
	rule, ok := h.rules[ruleID]
	if !ok || !rule.Enabled {
		h.mu.Unlock()
		return
	}
	// 若已有 listener 且配置相同则跳过
	if rl, exists := h.listeners[ruleID]; exists && rl.running {
		if rl.rule.ListenPort == rule.ListenPort &&
			rl.rule.ListenHost == rule.ListenHost &&
			rl.rule.AgentID == rule.AgentID &&
			rl.rule.RemoteHost == rule.RemoteHost &&
			rl.rule.RemotePort == rule.RemotePort {
			rl.rule = rule
			h.mu.Unlock()
			return
		}
		h.stopListenerLocked(rl)
		delete(h.listeners, ruleID)
	}
	h.mu.Unlock()

	host := strings.TrimSpace(rule.ListenHost)
	if host == "" {
		host = "0.0.0.0"
	}
	addr := net.JoinHostPort(host, fmt.Sprintf("%d", rule.ListenPort))
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		h.mu.Lock()
		h.listeners[ruleID] = &ruleListener{
			rule:    rule,
			lastErr: err.Error(),
			running: false,
			stop:    make(chan struct{}),
		}
		h.mu.Unlock()
		log.Printf("[tunnel] listen %s failed: %v", addr, err)
		return
	}
	rl := &ruleListener{
		rule:    rule,
		ln:      ln,
		stop:    make(chan struct{}),
		running: true,
	}
	h.mu.Lock()
	h.listeners[ruleID] = rl
	h.mu.Unlock()
	log.Printf("[tunnel] listening %s → agent=%s %s:%d", addr, rule.AgentID, rule.RemoteHost, rule.RemotePort)
	go h.acceptLoop(rl)
}

func (h *Hub) stopListenerLocked(rl *ruleListener) {
	if rl == nil {
		return
	}
	select {
	case <-rl.stop:
	default:
		close(rl.stop)
	}
	if rl.ln != nil {
		_ = rl.ln.Close()
	}
	rl.running = false
}

func (h *Hub) acceptLoop(rl *ruleListener) {
	for {
		c, err := rl.ln.Accept()
		if err != nil {
			select {
			case <-rl.stop:
				return
			default:
				rl.lastErr = err.Error()
				return
			}
		}
		// 并发上限
		max := rl.rule.MaxConns
		if max <= 0 {
			max = 256
		}
		if int(rl.active.Load()) >= max {
			_ = c.Close()
			continue
		}
		rl.active.Add(1)
		rl.total.Add(1)
		go func(conn net.Conn) {
			defer func() {
				rl.active.Add(-1)
				_ = conn.Close()
			}()
			h.handleIncoming(rl.rule, conn)
		}(c)
	}
}

func (h *Hub) handleIncoming(rule model.TunnelRule, client net.Conn) {
	sess, ok := h.GetSession(rule.AgentID)
	if !ok {
		// 无 Agent:短暂等待?直接关
		_, _ = client.Write([]byte("tunnel agent offline\n"))
		return
	}
	remoteHost := rule.RemoteHost
	if remoteHost == "" {
		remoteHost = "127.0.0.1"
	}
	pipe, err := sess.OpenRemote(remoteHost, rule.RemotePort, 20*time.Second)
	if err != nil {
		log.Printf("[tunnel] open remote %s:%d via %s: %v", remoteHost, rule.RemotePort, rule.AgentID, err)
		return
	}
	// 空闲超时为滑动窗口；任一方向有数据都会续期，适配 WebSocket 长连接。
	if rule.IdleTimeoutSec > 0 {
		d := time.Duration(rule.IdleTimeoutSec) * time.Second
		client = newIdleTimeoutConn(client, d)
	}
	Bridge(client, pipe)
}

// RuntimeStatus 所有规则运行时。
func (h *Hub) RuntimeStatus() map[uint]RuleRuntime {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make(map[uint]RuleRuntime, len(h.rules))
	for id, rule := range h.rules {
		rt := RuleRuntime{
			RuleID:      id,
			AgentOnline: false,
		}
		if _, ok := h.sessions[rule.AgentID]; ok {
			rt.AgentOnline = true
		}
		host := rule.ListenHost
		if host == "" {
			host = "0.0.0.0"
		}
		rt.ListenAddr = net.JoinHostPort(host, fmt.Sprintf("%d", rule.ListenPort))
		if rl, ok := h.listeners[id]; ok {
			rt.Listening = rl.running
			rt.Error = rl.lastErr
			rt.ActiveConns = rl.active.Load()
			rt.TotalConns = rl.total.Load()
			rt.WaitingAgent = rl.running && !rt.AgentOnline
		} else if rule.Enabled {
			rt.WaitingAgent = true
			if !rt.AgentOnline {
				rt.Error = "waiting agent"
			}
		}
		out[id] = rt
	}
	return out
}

// Close 关闭全部。
func (h *Hub) Close() {
	select {
	case <-h.closed:
		return
	default:
		close(h.closed)
	}
	h.mu.Lock()
	for _, rl := range h.listeners {
		h.stopListenerLocked(rl)
	}
	h.listeners = map[uint]*ruleListener{}
	sessions := make([]*Session, 0, len(h.sessions))
	for _, s := range h.sessions {
		sessions = append(sessions, s)
	}
	h.sessions = map[string]*Session{}
	h.mu.Unlock()

	// Session.Close 会回调 Hub，不能在持有 h.mu 时调用。
	for _, s := range sessions {
		s.Close()
	}
}
