package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"sync"
	"time"

	"aluka_ops/internal/config"
	"aluka_ops/internal/pkg/tunnel"
)

// AgentView Controller 侧看到的 Agent 视图。
type AgentView struct {
	AgentID       string              `json:"agent_id"`
	Host          string              `json:"host"`
	OS            string              `json:"os"`
	Arch          string              `json:"arch"`
	Version       string              `json:"version"`
	HTTPPort      int                 `json:"http_port"`
	APIBase       string              `json:"api_base"`
	Online        bool                `json:"online"`
	LastSeenAt    time.Time           `json:"last_seen_at"`
	ServicesTotal int                 `json:"services_total"`
	ServicesRun   int                 `json:"services_running"`
	ServicesCrash int                 `json:"services_crashed"`
	RuntimesTotal int                 `json:"runtimes_total"`
	Services      []RemoteServiceInfo `json:"services,omitempty"`
	Raw           map[string]any      `json:"raw,omitempty"`
}

// RemoteServiceInfo 心跳中的远端服务摘要。
type RemoteServiceInfo struct {
	ID      uint   `json:"id"`
	Code    string `json:"code"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Status  string `json:"status"`
	PID     int    `json:"pid"`
	Version string `json:"version"`
}

// ControllerRegistry 内存中的 Agent 注册表(Controller 模式)。
type ControllerRegistry struct {
	cfg   *config.Config
	mu    sync.RWMutex
	agents map[string]*agentRecord
	hub   *tunnel.Hub // 可选:注入隧道 Hub 后,回连优先走隧道
}

type agentRecord struct {
	view AgentView
}

// NewControllerRegistry 构造。
func NewControllerRegistry(cfg *config.Config) *ControllerRegistry {
	return &ControllerRegistry{
		cfg:    cfg,
		agents: make(map[string]*agentRecord),
	}
}

// SetTunnel 注入隧道 Hub。注入后 Proxy/ProxyRaw 在 Agent 存在隧道会话时
// 优先经隧道(127.0.0.1:http_port)回连,否则回落直连 AdvertiseURL。
// Controller 与 Agent 同进程时不影响(本机走直连即可)。
func (r *ControllerRegistry) SetTunnel(hub *tunnel.Hub) { r.hub = hub }

// dialRoute 决定某次回连使用的通道与底层连接。
// 返回 (conn, via, error):隧道优先,直连兜底。
//   - 隧道:hub 中存在该 Agent 的会话 → OpenRemote(127.0.0.1, http_port)
//   - 直连:无隧道会话且 APIBase 可达 → net.Dial(APIBase host)
//   - 二者皆不可:返回错误,附带原因供 handler 展示
func (r *ControllerRegistry) dialRoute(ctx context.Context, view *AgentView) (net.Conn, string, error) {
	// 1) 隧道优先:Agent 已建立反向隧道会话
	if r.hub != nil {
		if sess, ok := r.hub.GetSession(view.AgentID); ok && view.HTTPPort > 0 {
			conn, err := tunnel.DialAgentHTTP(ctx, sess, view.HTTPPort)
			if err == nil {
				return conn, "tunnel", nil
			}
			// 隧道拨号失败,继续尝试直连兜底(APIBase 可达时)
		}
	}
	// 2) 直连兜底:解析 APIBase host:port
	if view.APIBase == "" {
		return nil, "", fmt.Errorf("Agent 未建立隧道且未上报 api_base,无法回连")
	}
	host, err := urlHost(view.APIBase)
	if err != nil {
		return nil, "", fmt.Errorf("解析 api_base 失败: %w", err)
	}
	dialer := net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", host)
	if err != nil {
		return nil, "", fmt.Errorf("直连 Agent 失败(%s): %w", host, err)
	}
	return conn, "direct", nil
}

// DialShellConn 为 WS 控制台代理拨号到 Agent,返回裸 net.Conn + 通道(tunnel/direct)。
// 隧道优先,直连兜底;调用方负责关闭连接。
func (r *ControllerRegistry) DialShellConn(ctx context.Context, agentID string) (net.Conn, string, error) {
	view, ok := r.Get(agentID)
	if !ok {
		return nil, "", fmt.Errorf("Agent 不存在: %s", agentID)
	}
	if !view.Online {
		return nil, "", fmt.Errorf("Agent 离线: %s", agentID)
	}
	return r.dialRoute(ctx, view)
}

// IngestHeartbeat 接收并合并一次心跳。
func (r *ControllerRegistry) IngestHeartbeat(payload map[string]any) (*AgentView, error) {
	id, _ := payload["agent_id"].(string)
	if id == "" {
		return nil, fmt.Errorf("缺少 agent_id")
	}

	view := AgentView{
		AgentID:    id,
		Host:       strVal(payload["host"]),
		OS:         strVal(payload["os"]),
		Arch:       strVal(payload["arch"]),
		Version:    strVal(payload["version"]),
		HTTPPort:   intVal(payload["http_port"]),
		APIBase:    strVal(payload["api_base"]),
		LastSeenAt: time.Now(),
		Online:     true,
		Raw:        payload,
	}
	if view.APIBase == "" && view.Host != "" && view.HTTPPort > 0 {
		view.APIBase = fmt.Sprintf("http://%s:%d", view.Host, view.HTTPPort)
	}
	if svc, ok := payload["services"].(map[string]any); ok {
		view.ServicesTotal = intVal(svc["total"])
		view.ServicesRun = intVal(svc["running"])
		view.ServicesCrash = intVal(svc["crashed"])
		if items, ok := svc["items"].([]any); ok {
			for _, it := range items {
				m, ok := it.(map[string]any)
				if !ok {
					continue
				}
				view.Services = append(view.Services, RemoteServiceInfo{
					ID:      uint(intVal(m["id"])),
					Code:    strVal(m["code"]),
					Name:    strVal(m["name"]),
					Type:    strVal(m["type"]),
					Status:  strVal(m["status"]),
					PID:     intVal(m["pid"]),
					Version: strVal(m["version"]),
				})
			}
		}
	}
	view.RuntimesTotal = intVal(payload["runtimes_total"])

	r.mu.Lock()
	r.agents[id] = &agentRecord{view: view}
	r.mu.Unlock()

	v := view
	return &v, nil
}

// List 列出所有 Agent(刷新 online 状态)。
func (r *ControllerRegistry) List() []AgentView {
	r.mu.RLock()
	defer r.mu.RUnlock()
	offlineAfter := time.Duration(r.cfg.OfflineAfterSec) * time.Second
	if offlineAfter <= 0 {
		offlineAfter = 45 * time.Second
	}
	now := time.Now()
	out := make([]AgentView, 0, len(r.agents))
	for _, rec := range r.agents {
		v := rec.view
		v.Online = now.Sub(v.LastSeenAt) <= offlineAfter
		// list 不返回 raw 以减小体积
		v.Raw = nil
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AgentID < out[j].AgentID })
	return out
}

// Get 获取单个 Agent。
func (r *ControllerRegistry) Get(agentID string) (*AgentView, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	rec, ok := r.agents[agentID]
	if !ok {
		return nil, false
	}
	v := rec.view
	offlineAfter := time.Duration(r.cfg.OfflineAfterSec) * time.Second
	if offlineAfter <= 0 {
		offlineAfter = 45 * time.Second
	}
	v.Online = time.Now().Sub(v.LastSeenAt) <= offlineAfter
	return &v, true
}

// Proxy 向 Agent 转发 JSON HTTP 请求(用于已有 services 代理等)。
// 隧道优先,直连兜底。返回解析后的 {code,message,data} 或 {raw: string}。
func (r *ControllerRegistry) Proxy(agentID, method, path string, body any) (int, map[string]any, error) {
	view, ok := r.Get(agentID)
	if !ok {
		return 0, nil, fmt.Errorf("Agent 不存在: %s", agentID)
	}
	if !view.Online {
		return 0, nil, fmt.Errorf("Agent 离线: %s", agentID)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn, via, err := r.dialRoute(ctx, view)
	if err != nil {
		return 0, nil, err
	}
	defer conn.Close()

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, viaURL(via, view, path), reader)
	if err != nil {
		return 0, nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if r.cfg.AgentToken != "" {
		req.Header.Set("X-Agent-Token", r.cfg.AgentToken)
	}
	resp, err := (&http.Client{Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) { return conn, nil },
	}}).Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var payload map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &payload)
	}
	if payload == nil {
		payload = map[string]any{"raw": string(raw)}
	}
	return resp.StatusCode, payload, nil
}

// ProxyResult 透传代理结果(支持二进制 body,由调用方负责关闭)。
type ProxyResult struct {
	StatusCode  int
	ContentType string
	Body        io.ReadCloser
	Via         string // tunnel / direct
}

// ProxyRaw 向 Agent 透传任意 HTTP 请求(支持二进制响应,如文件下载/上传)。
// method/path/body/query/header 由调用方提供;Body 流式转发并流式返回。
// 调用方负责关闭 result.Body。隧道优先,直连兜底。
func (r *ControllerRegistry) ProxyRaw(ctx context.Context, agentID, method, path string,
	body io.Reader, headers map[string]string) (*ProxyResult, error) {
	view, ok := r.Get(agentID)
	if !ok {
		return nil, fmt.Errorf("Agent 不存在: %s", agentID)
	}
	if !view.Online {
		return nil, fmt.Errorf("Agent 离线: %s", agentID)
	}
	conn, via, err := r.dialRoute(ctx, view)
	if err != nil {
		return nil, err
	}
	// 注意:连接由 Transport 持有;响应 Body 读取完毕后由 Transport 关闭。
	req, err := http.NewRequestWithContext(ctx, method, viaURL(via, view, path), body)
	if err != nil {
		conn.Close()
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if r.cfg.AgentToken != "" {
		req.Header.Set("X-Agent-Token", r.cfg.AgentToken)
	}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) { return conn, nil },
	}
	resp, err := (&http.Client{Transport: transport}).Do(req)
	if err != nil {
		return nil, err
	}
	return &ProxyResult{
		StatusCode:  resp.StatusCode,
		ContentType: resp.Header.Get("Content-Type"),
		Body:        resp.Body,
		Via:         via,
	}, nil
}

// viaURL 构造请求 URL:隧道用 loopback 占位 host(DialContext 已劫持连接,
// 仅用于拼装合法的 HTTP 请求行与 Host 头,真实连接走隧道);直连用 APIBase + path。
func viaURL(via string, view *AgentView, path string) string {
	if via == "tunnel" {
		return fmt.Sprintf("http://127.0.0.1:%d%s", view.HTTPPort, path)
	}
	return view.APIBase + path
}

// urlHost 解析 api_base,提取 host[:port]。
func urlHost(apiBase string) (string, error) {
	u, err := url.Parse(apiBase)
	if err != nil {
		return "", err
	}
	if u.Host == "" {
		return "", fmt.Errorf("api_base 缺少 host")
	}
	return u.Host, nil
}

func strVal(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func intVal(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	case string:
		var n int
		fmt.Sscanf(t, "%d", &n)
		return n
	default:
		return 0
	}
}
