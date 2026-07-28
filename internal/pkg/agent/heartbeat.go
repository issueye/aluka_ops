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
	"time"

	"aluka_ops/internal/config"
	"aluka_ops/internal/service"
)

// HeartbeatLoop 定时向 Controller 上报。
type HeartbeatLoop struct {
	cfg   *config.Config
	agent *service.AgentService
	stop  chan struct{}
}

// NewHeartbeatLoop 构造。
func NewHeartbeatLoop(cfg *config.Config, agent *service.AgentService) *HeartbeatLoop {
	return &HeartbeatLoop{
		cfg:   cfg,
		agent: agent,
		stop:  make(chan struct{}),
	}
}

// Start 启动后台循环(若未配置 Controller 则 no-op)。
func (h *HeartbeatLoop) Start() {
	if h == nil || h.cfg == nil || !h.cfg.HeartbeatEnabled() {
		if h != nil && h.cfg != nil && h.cfg.IsAgentMode() && h.cfg.ControllerURL == "" {
			log.Printf("[agent] mode=agent 但未配置 ALUKA_CONTROLLER_URL,心跳未启动")
		}
		return
	}
	interval := time.Duration(h.cfg.HeartbeatSec) * time.Second
	if interval < 5*time.Second {
		interval = 5 * time.Second
	}
	log.Printf("[agent] 心跳上报已启动 → %s (每 %v)", h.cfg.ControllerURL, interval)
	go h.loop(interval)
}

// Stop 停止。
func (h *HeartbeatLoop) Stop() {
	if h == nil {
		return
	}
	select {
	case <-h.stop:
	default:
		close(h.stop)
	}
}

func (h *HeartbeatLoop) loop(interval time.Duration) {
	// 启动后立即上报一次
	h.beatOnce()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-h.stop:
			return
		case <-ticker.C:
			h.beatOnce()
		}
	}
}

func (h *HeartbeatLoop) beatOnce() {
	payload := h.agent.HeartbeatPayload()
	body, err := json.Marshal(payload)
	if err != nil {
		h.agent.RecordHeartbeat(false, 0, err.Error())
		return
	}
	url := h.cfg.ControllerURL + "/api/agents/heartbeat"
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
