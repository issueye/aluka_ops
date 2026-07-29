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

func (h *HeartbeatLoop) beatOnce() {
	if h.agent == nil {
		return
	}
	if h.cfg == nil || h.cfg.ControllerURL == "" {
		h.agent.RecordHeartbeat(false, 0, "controller_url empty")
		return
	}
	payload := h.agent.HeartbeatPayload()
	body, err := json.Marshal(payload)
	if err != nil {
		h.agent.RecordHeartbeat(false, 0, err.Error())
		return
	}
	url := strings.TrimRight(h.cfg.ControllerURL, "/") + "/api/agents/heartbeat"
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		h.agent.RecordHeartbeat(false, 0, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if h.cfg.AgentToken != "" {
		req.Header.Set("X-Agent-Token", h.cfg.AgentToken)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.agent.RecordHeartbeat(false, 0, err.Error())
		log.Printf("[agent] 心跳失败: %v", err)
		return
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		h.agent.RecordHeartbeat(true, resp.StatusCode, "ok")
	} else {
		msg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		h.agent.RecordHeartbeat(false, resp.StatusCode, msg)
		log.Printf("[agent] 心跳被拒绝: %s", msg)
	}
}
