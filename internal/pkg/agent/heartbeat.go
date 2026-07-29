// Package agent 提供 Agent 模式向中心 Controller 的心跳上报。
package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"aluka_ops/internal/config"
)

// Reporter 心跳载荷与结果回写(由 service.AgentService 实现,避免包循环依赖)。
type Reporter interface {
	HeartbeatPayload() map[string]any
	RecordHeartbeat(ok bool, httpStatus int, msg string)
}

// HeartbeatLoop 定时向 Controller 上报;支持运行时启停/重配。
type HeartbeatLoop struct {
	cfg   *config.Config
	agent Reporter

	mu      sync.Mutex
	stop    chan struct{}
	running bool
}

// NewHeartbeatLoop 构造(尚未 Start)。
func NewHeartbeatLoop(cfg *config.Config, agent Reporter) *HeartbeatLoop {
	return &HeartbeatLoop{
		cfg:   cfg,
		agent: agent,
	}
}

// Start 按当前 cfg 启动后台循环(已在跑则 no-op;未启用则 no-op)。
func (h *HeartbeatLoop) Start() {
	if h == nil || h.cfg == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.running {
		return
	}
	if !h.cfg.HeartbeatEnabled() {
		if h.cfg.IsAgentMode() && h.cfg.ControllerURL == "" {
			log.Printf("[agent] mode=agent 但未配置 ControllerURL,心跳未启动")
		}
		return
	}
	h.stop = make(chan struct{})
	h.running = true
	interval := time.Duration(h.cfg.HeartbeatSec) * time.Second
	if interval < 5*time.Second {
		interval = 5 * time.Second
	}
	log.Printf("[agent] 心跳上报已启动 → %s (每 %v)", h.cfg.ControllerURL, interval)
	go h.loop(h.stop, interval)
}

// Stop 停止循环。
func (h *HeartbeatLoop) Stop() {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.running {
		return
	}
	close(h.stop)
	h.running = false
	h.stop = nil
	log.Printf("[agent] 心跳上报已停止")
}

// Restart 按最新 cfg 停止后重新启动。
func (h *HeartbeatLoop) Restart() {
	h.Stop()
	h.Start()
}

// Running 是否在跑。
func (h *HeartbeatLoop) Running() bool {
	if h == nil {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.running
}

// BeatOnce 立即上报一次(不依赖循环状态)。
func (h *HeartbeatLoop) BeatOnce() {
	if h == nil || h.cfg == nil || h.cfg.ControllerURL == "" {
		return
	}
	h.beatOnce()
}

// BeatOnceResult 立即上报并返回是否成功与可读错误。
func (h *HeartbeatLoop) BeatOnceResult() (ok bool, httpStatus int, msg string) {
	if h == nil || h.cfg == nil || h.cfg.ControllerURL == "" {
		return false, 0, "未配置 Controller URL"
	}
	return h.beatOnce()
}

// RecordFailure 将连接/探测失败写入心跳状态(供前端展示)。
func (h *HeartbeatLoop) RecordFailure(msg string) {
	if h == nil || h.agent == nil {
		return
	}
	if msg == "" {
		msg = "连接失败"
	}
	h.agent.RecordHeartbeat(false, 0, msg)
}

func (h *HeartbeatLoop) loop(stop <-chan struct{}, interval time.Duration) {
	h.beatOnce()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			h.beatOnce()
		}
	}
}

func (h *HeartbeatLoop) beatOnce() (ok bool, httpStatus int, msg string) {
	if h.agent == nil {
		return false, 0, "agent reporter nil"
	}
	if h.cfg == nil || h.cfg.ControllerURL == "" {
		msg = "未配置 Controller URL"
		h.agent.RecordHeartbeat(false, 0, msg)
		return false, 0, msg
	}
	payload := h.agent.HeartbeatPayload()
	body, err := json.Marshal(payload)
	if err != nil {
		msg = friendlyNetErr(err)
		h.agent.RecordHeartbeat(false, 0, msg)
		return false, 0, msg
	}
	url := strings.TrimRight(h.cfg.ControllerURL, "/") + "/api/agents/heartbeat"
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		msg = friendlyNetErr(err)
		h.agent.RecordHeartbeat(false, 0, msg)
		return false, 0, msg
	}
	req.Header.Set("Content-Type", "application/json")
	if h.cfg.AgentToken != "" {
		req.Header.Set("X-Agent-Token", h.cfg.AgentToken)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		msg = friendlyNetErr(err)
		h.agent.RecordHeartbeat(false, 0, msg)
		log.Printf("[agent] 心跳失败: %s", msg)
		return false, 0, msg
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		h.agent.RecordHeartbeat(true, resp.StatusCode, "ok")
		return true, resp.StatusCode, "ok"
	}
	msg = fmt.Sprintf("中心拒绝心跳 HTTP %d", resp.StatusCode)
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		msg = "中心拒绝：Token 不匹配或无权限(HTTP " + itoa(resp.StatusCode) + ")"
	}
	if len(raw) > 0 && len(raw) < 200 {
		msg = msg + " · " + string(raw)
	}
	h.agent.RecordHeartbeat(false, resp.StatusCode, msg)
	log.Printf("[agent] 心跳被拒绝: %s", msg)
	return false, resp.StatusCode, msg
}

// friendlyNetErr 将 dial/refused 等英文错误转成可读中文。
func friendlyNetErr(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	low := strings.ToLower(s)
	switch {
	case strings.Contains(low, "connection refused") || strings.Contains(low, "actively refused"):
		// 从 URL 里尽量抽出地址
		return "无法连接中心：目标端口无进程监听(connection refused)。请确认中心已启动，且 Controller URL 的 IP/端口正确（本机默认端口常为 18080，不是 19090）。"
	case strings.Contains(low, "no such host") || strings.Contains(low, "server misbehaving"):
		return "无法解析中心主机名：请检查 Controller URL"
	case strings.Contains(low, "i/o timeout") || strings.Contains(low, "deadline exceeded") || strings.Contains(low, "timeout"):
		return "连接中心超时：请检查网络/防火墙是否放行该端口"
	case strings.Contains(low, "network is unreachable"):
		return "网络不可达：请检查本机到中心的路由"
	case strings.Contains(low, "tls") || strings.Contains(low, "x509"):
		return "TLS/证书错误：" + s
	default:
		return s
	}
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
