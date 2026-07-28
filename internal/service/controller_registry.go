package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"sync"
	"time"

	"aluka_ops/internal/config"
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

// Proxy 向 Agent 转发 HTTP 请求。
func (r *ControllerRegistry) Proxy(agentID, method, path string, body any) (int, map[string]any, error) {
	view, ok := r.Get(agentID)
	if !ok {
		return 0, nil, fmt.Errorf("Agent 不存在: %s", agentID)
	}
	if !view.Online {
		return 0, nil, fmt.Errorf("Agent 离线: %s", agentID)
	}
	if view.APIBase == "" {
		return 0, nil, fmt.Errorf("Agent 未上报 api_base,无法回连")
	}
	url := view.APIBase + path
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		reader = bytes.NewReader(b)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return 0, nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if r.cfg.AgentToken != "" {
		req.Header.Set("X-Agent-Token", r.cfg.AgentToken)
	}
	resp, err := http.DefaultClient.Do(req)
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
