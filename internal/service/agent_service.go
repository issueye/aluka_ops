package service

import (
	"os"
	"runtime"
	"strconv"
	"sync"
	"time"

	"aluka_ops/internal/config"
	"aluka_ops/internal/model"
	"aluka_ops/internal/repository"
	"aluka_ops/internal/version"
)

// AgentService 本机 Agent 信息与心跳状态。
type AgentService struct {
	cfg     *config.Config
	svcRepo *repository.ServiceRepository
	rtRepo  *repository.RuntimeRepository

	mu           sync.RWMutex
	lastBeatAt   *time.Time
	lastBeatOK   bool
	lastBeatMsg  string
	lastBeatHTTP int
}

// NewAgentService 构造。
func NewAgentService(
	cfg *config.Config,
	svcRepo *repository.ServiceRepository,
	rtRepo *repository.RuntimeRepository,
) *AgentService {
	return &AgentService{cfg: cfg, svcRepo: svcRepo, rtRepo: rtRepo}
}

// Snapshot 生成 Agent 状态快照(供 API 与心跳上报)。
func (s *AgentService) Snapshot() map[string]any {
	host, _ := os.Hostname()
	services, _ := s.svcRepo.List(repository.ListFilter{})
	var total, running, stopped, crashed, created int
	list := make([]map[string]any, 0, len(services))
	for _, svc := range services {
		total++
		switch svc.Status {
		case model.StatusRunning:
			running++
		case model.StatusStopped:
			stopped++
		case model.StatusCrashed:
			crashed++
		case model.StatusCreated:
			created++
		}
		list = append(list, map[string]any{
			"id":      svc.ID,
			"code":    svc.Code,
			"name":    svc.Name,
			"type":    svc.Type,
			"status":  svc.Status,
			"pid":     svc.PID,
			"version": svc.CurrentVersion,
		})
	}
	runtimes, _ := s.rtRepo.List()

	s.mu.RLock()
	lastAt, lastOK, lastMsg, lastHTTP := s.lastBeatAt, s.lastBeatOK, s.lastBeatMsg, s.lastBeatHTTP
	s.mu.RUnlock()

	apiBase := s.cfg.AdvertiseURL
	if apiBase == "" && host != "" {
		apiBase = "http://" + host + ":" + itoa(s.cfg.HTTPPort)
	}

	return map[string]any{
		"agent_id":   s.cfg.AgentID,
		"mode":       s.cfg.Mode,
		"version":    version.AppVersion,
		"host":       host,
		"os":         runtime.GOOS,
		"arch":       runtime.GOARCH,
		"http_port":  s.cfg.HTTPPort,
		"api_base":   apiBase,
		"controller": s.cfg.ControllerURL,
		"heartbeat": map[string]any{
			"enabled":      s.cfg.HeartbeatEnabled(),
			"interval_sec": s.cfg.HeartbeatSec,
			"last_at":      lastAt,
			"last_ok":      lastOK,
			"last_msg":     lastMsg,
			"last_http":    lastHTTP,
		},
		"services": map[string]any{
			"total":   total,
			"running": running,
			"stopped": stopped,
			"crashed": crashed,
			"created": created,
			"items":   list,
		},
		"runtimes_total": len(runtimes),
		"timestamp":      time.Now().Format(time.RFC3339),
	}
}

func itoa(n int) string {
	return strconv.Itoa(n)
}

// RecordHeartbeat 记录一次心跳结果。
func (s *AgentService) RecordHeartbeat(ok bool, httpStatus int, msg string) {
	now := time.Now()
	s.mu.Lock()
	s.lastBeatAt = &now
	s.lastBeatOK = ok
	s.lastBeatHTTP = httpStatus
	s.lastBeatMsg = msg
	s.mu.Unlock()
}

// HeartbeatPayload 上报给 Controller 的载荷(含服务列表摘要,供中心展示)。
func (s *AgentService) HeartbeatPayload() map[string]any {
	snap := s.Snapshot()
	if s.cfg.AgentToken != "" {
		snap["agent_token"] = s.cfg.AgentToken
	}
	return snap
}
