package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"aluka_ops/internal/config"
	"aluka_ops/internal/pkg/agent"
	"aluka_ops/internal/pkg/tunnel"
	"aluka_ops/internal/repository"
)

// settings keys(集群/节点角色)
const (
	SettingMode          = "cluster.mode"
	SettingControllerURL = "cluster.controller_url"
	SettingAgentToken    = "cluster.agent_token"
	SettingAgentID       = "cluster.agent_id"
	SettingAdvertiseURL  = "cluster.advertise_url"
	SettingHeartbeatSec  = "cluster.heartbeat_sec"
)

var clusterKeys = []string{
	SettingMode,
	SettingControllerURL,
	SettingAgentToken,
	SettingAgentID,
	SettingAdvertiseURL,
	SettingHeartbeatSec,
}

// ClusterService 运行时集群角色与连接管理。
// 可在前端切换 standalone / agent / controller,并主动连接中心。
type ClusterService struct {
	cfg    *config.Config
	repo   *repository.SettingRepository
	hb     *agent.HeartbeatLoop
	hub    *tunnel.Hub // optional, for session status
	// onBecomeHub 切到 controller/standalone 时回调(如重载隧道规则)
	onBecomeHub func()

	mu           sync.Mutex
	tunnelClient *tunnel.AgentClient
}

func NewClusterService(
	cfg *config.Config,
	repo *repository.SettingRepository,
	hb *agent.HeartbeatLoop,
	hub *tunnel.Hub,
) *ClusterService {
	return &ClusterService{cfg: cfg, repo: repo, hb: hb, hub: hub}
}

// SetOnBecomeHub 注册切为中心侧时的回调。
func (s *ClusterService) SetOnBecomeHub(fn func()) {
	if s != nil {
		s.onBecomeHub = fn
	}
}

// LoadPersisted 启动时用 DB 覆盖集群相关配置(若有记录)。
// 优先级: DB 持久化 > 启动时 env/CLI 已写入的 cfg(仅当 DB 有对应 key 时覆盖)。
func (s *ClusterService) LoadPersisted() {
	if s == nil || s.repo == nil || s.cfg == nil {
		return
	}
	kv := s.repo.GetMany(clusterKeys)
	if len(kv) == 0 {
		return
	}
	s.applyKVToConfig(kv)
	// 确保 hub token 与 cfg 一致
	if s.hub != nil {
		s.hub.SetToken(s.cfg.AgentToken)
	}
}

// StartBackground 按当前 cfg 启动心跳与隧道客户端。
func (s *ClusterService) StartBackground() {
	if s == nil {
		return
	}
	if s.hb != nil {
		s.hb.Start()
	}
	s.restartTunnelClient()
}

// StopBackground 停止心跳与隧道。
func (s *ClusterService) StopBackground() {
	if s == nil {
		return
	}
	if s.hb != nil {
		s.hb.Stop()
	}
	s.mu.Lock()
	if s.tunnelClient != nil {
		s.tunnelClient.Stop()
		s.tunnelClient = nil
	}
	s.mu.Unlock()
}

// Status 当前角色与连接状态(供前端)。
func (s *ClusterService) Status() map[string]any {
	cfg := s.cfg
	var tunnelSessions []tunnel.SessionInfo
	if s.hub != nil {
		tunnelSessions = s.hub.ListSessions()
	}
	s.mu.Lock()
	tcRunning := s.tunnelClient != nil
	s.mu.Unlock()
	hbRunning := false
	if s.hb != nil {
		hbRunning = s.hb.Running()
	}
	return map[string]any{
		"mode":            string(cfg.Mode),
		"agent_id":        cfg.AgentID,
		"controller_url":  cfg.ControllerURL,
		"agent_token_set": strings.TrimSpace(cfg.AgentToken) != "",
		// 不回传明文 token
		"advertise_url":   cfg.AdvertiseURL,
		"heartbeat_sec":   cfg.HeartbeatSec,
		"heartbeat_enabled": cfg.HeartbeatEnabled(),
		"heartbeat_running": hbRunning,
		"tunnel_client_running": tcRunning,
		"is_agent":        cfg.IsAgentMode(),
		"is_controller":   cfg.IsControllerMode(),
		"tunnel_sessions": tunnelSessions,
		"http_port":       cfg.HTTPPort,
	}
}

// ClusterConfigInput 更新输入。
type ClusterConfigInput struct {
	Mode          *string `json:"mode"`
	ControllerURL *string `json:"controller_url"`
	AgentToken    *string `json:"agent_token"` // 空字符串表示清空;省略则不变
	AgentID       *string `json:"agent_id"`
	AdvertiseURL  *string `json:"advertise_url"`
	HeartbeatSec  *int    `json:"heartbeat_sec"`
	// Connect 保存后是否立即连接(agent 模式)
	Connect *bool `json:"connect"`
}

// UpdateConfig 校验、持久化、应用到内存并重连。
func (s *ClusterService) UpdateConfig(in ClusterConfigInput) (map[string]any, error) {
	if s == nil || s.cfg == nil {
		return nil, errors.New("cluster service not ready")
	}

	kv := map[string]string{}

	if in.Mode != nil {
		m := config.Mode(strings.TrimSpace(strings.ToLower(*in.Mode)))
		switch m {
		case config.ModeStandalone, config.ModeAgent, config.ModeController:
			kv[SettingMode] = string(m)
		default:
			return nil, fmt.Errorf("mode 须为 standalone|agent|controller")
		}
	}
	if in.ControllerURL != nil {
		kv[SettingControllerURL] = strings.TrimRight(strings.TrimSpace(*in.ControllerURL), "/")
	}
	if in.AgentToken != nil {
		kv[SettingAgentToken] = *in.AgentToken
	}
	if in.AgentID != nil {
		id := strings.TrimSpace(*in.AgentID)
		if id == "" {
			return nil, fmt.Errorf("agent_id 不能为空")
		}
		kv[SettingAgentID] = id
	}
	if in.AdvertiseURL != nil {
		kv[SettingAdvertiseURL] = strings.TrimRight(strings.TrimSpace(*in.AdvertiseURL), "/")
	}
	if in.HeartbeatSec != nil {
		sec := *in.HeartbeatSec
		if sec < 5 {
			sec = 5
		}
		if sec > 3600 {
			sec = 3600
		}
		kv[SettingHeartbeatSec] = fmt.Sprintf("%d", sec)
	}

	if len(kv) > 0 {
		if err := s.repo.SetMany(kv); err != nil {
			return nil, err
		}
		s.applyKVToConfig(kv)
	}

	// 按新配置重启后台连接
	s.reconfigureBackground()

	doConnect := true
	if in.Connect != nil {
		doConnect = *in.Connect
	}
	if doConnect && s.cfg.IsAgentMode() && s.cfg.ControllerURL != "" {
		st, err := s.ConnectNow()
		// 配置已保存;连接失败时仍返回 status + error 供前端提示
		return st, err
	}

	return s.Status(), nil
}

// ConnectNow Agent 立即心跳 + 确保隧道客户端在跑。
// 若心跳失败仍返回 status，但 error 带可读原因(前端 toast)。
func (s *ClusterService) ConnectNow() (map[string]any, error) {
	if s == nil || s.cfg == nil {
		return nil, errors.New("not ready")
	}
	if !s.cfg.IsAgentMode() {
		return nil, fmt.Errorf("仅 agent 模式可连接中心(当前 %s)", s.cfg.Mode)
	}
	if strings.TrimSpace(s.cfg.ControllerURL) == "" {
		return nil, fmt.Errorf("请先配置中心 Controller URL")
	}

	// 先探测中心 /api/health，给出更清晰的端口/连通性提示
	if err := probeControllerHealth(s.cfg.ControllerURL); err != nil {
		// 写入心跳状态,前端「连接失败原因」可立即看到中文说明
		if s.hb != nil {
			s.hb.RecordFailure(err.Error())
			s.hb.Restart()
		}
		s.restartTunnelClient()
		st := s.Status()
		st["connect_ok"] = false
		st["connect_error"] = err.Error()
		return st, err
	}

	// 确保循环在跑并立即打一发心跳
	var beatErr error
	if s.hb != nil {
		if !s.hb.Running() {
			s.hb.Start()
		}
		ok, _, msg := s.hb.BeatOnceResult()
		if !ok {
			beatErr = fmt.Errorf("%s", msg)
		}
	}
	s.restartTunnelClient()
	st := s.Status()
	if beatErr != nil {
		st["connect_ok"] = false
		st["connect_error"] = beatErr.Error()
		return st, beatErr
	}
	st["connect_ok"] = true
	return st, nil
}

// probeControllerHealth GET {base}/api/health
func probeControllerHealth(base string) error {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" {
		return fmt.Errorf("未配置 Controller URL")
	}
	u := base + "/api/health"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		// 复用 heartbeat 的友好文案逻辑（内联避免循环依赖）
		low := strings.ToLower(err.Error())
		if strings.Contains(low, "connection refused") || strings.Contains(low, "actively refused") {
			return fmt.Errorf("无法连接中心 %s：端口无进程监听。请在中心机器启动 aluka_ops，并确认端口(默认 18080)。当前配置: %s", base, base)
		}
		if strings.Contains(low, "timeout") || strings.Contains(low, "deadline") {
			return fmt.Errorf("连接中心超时 %s：检查网络/防火墙", base)
		}
		return fmt.Errorf("探测中心失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("中心健康检查返回 HTTP %d (%s)", resp.StatusCode, u)
}

// Disconnect 停止上报与隧道客户端(不改 mode,可选)。
func (s *ClusterService) Disconnect() map[string]any {
	if s.hb != nil {
		s.hb.Stop()
	}
	s.mu.Lock()
	if s.tunnelClient != nil {
		s.tunnelClient.Stop()
		s.tunnelClient = nil
	}
	s.mu.Unlock()
	return s.Status()
}

func (s *ClusterService) reconfigureBackground() {
	if s.cfg.IsAgentMode() {
		if s.cfg.ControllerURL != "" {
			if s.hb != nil {
				s.hb.Restart()
			}
			s.restartTunnelClient()
		} else {
			if s.hb != nil {
				s.hb.Stop()
			}
			s.mu.Lock()
			if s.tunnelClient != nil {
				s.tunnelClient.Stop()
				s.tunnelClient = nil
			}
			s.mu.Unlock()
		}
		return
	}
	// controller / standalone: 停 agent 侧连接,确保中心侧规则生效
	if s.hb != nil {
		s.hb.Stop()
	}
	s.mu.Lock()
	if s.tunnelClient != nil {
		s.tunnelClient.Stop()
		s.tunnelClient = nil
	}
	s.mu.Unlock()
	if s.onBecomeHub != nil {
		s.onBecomeHub()
	}
}

func (s *ClusterService) restartTunnelClient() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tunnelClient != nil {
		s.tunnelClient.Stop()
		s.tunnelClient = nil
	}
	if !s.cfg.IsAgentMode() || s.cfg.ControllerURL == "" {
		return
	}
	s.tunnelClient = tunnel.NewAgentClient(s.cfg.ControllerURL, s.cfg.AgentID, s.cfg.AgentToken, false)
	s.tunnelClient.Start()
}

func (s *ClusterService) applyKVToConfig(kv map[string]string) {
	if v, ok := kv[SettingMode]; ok && v != "" {
		s.cfg.Mode = config.Mode(v)
	}
	if v, ok := kv[SettingControllerURL]; ok {
		s.cfg.ControllerURL = strings.TrimRight(v, "/")
	}
	if v, ok := kv[SettingAgentToken]; ok {
		s.cfg.AgentToken = v
		// 同步隧道 Hub 校验密钥
		if s.hub != nil {
			s.hub.SetToken(v)
		}
	}
	if v, ok := kv[SettingAgentID]; ok && v != "" {
		s.cfg.AgentID = v
	}
	if v, ok := kv[SettingAdvertiseURL]; ok {
		s.cfg.AdvertiseURL = strings.TrimRight(v, "/")
	}
	if v, ok := kv[SettingHeartbeatSec]; ok && v != "" {
		var n int
		fmt.Sscanf(v, "%d", &n)
		if n >= 5 {
			s.cfg.HeartbeatSec = n
		}
	}
}
