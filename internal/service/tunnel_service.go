package service

import (
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"unicode"

	"aluka_ops/internal/model"
	"aluka_ops/internal/pkg/tunnel"
	"aluka_ops/internal/repository"
)

var (
	ErrTunnelInvalid = errors.New("invalid tunnel rule")
	ErrTunnelNotFound = errors.New("tunnel rule not found")
	ErrTunnelConflict = errors.New("tunnel conflict")
)

var tunnelCodeRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$`)

// TunnelService 隧道规则 CRUD + 应用到 Hub。
type TunnelService struct {
	repo     *repository.TunnelRepository
	portRepo *repository.GatewayPortRepository
	hub      *tunnel.Hub
}

func NewTunnelService(
	repo *repository.TunnelRepository,
	portRepo *repository.GatewayPortRepository,
	hub *tunnel.Hub,
) *TunnelService {
	return &TunnelService{repo: repo, portRepo: portRepo, hub: hub}
}

// Reload 从 DB 加载并 Apply。
func (s *TunnelService) Reload() error {
	if s.hub == nil {
		return nil
	}
	list, err := s.repo.List()
	if err != nil {
		return err
	}
	s.hub.ApplyRules(list)
	return nil
}

// List 规则 + 运行时。
func (s *TunnelService) List() ([]model.TunnelRule, map[uint]tunnel.RuleRuntime, []tunnel.SessionInfo, error) {
	list, err := s.repo.List()
	if err != nil {
		return nil, nil, nil, err
	}
	var rt map[uint]tunnel.RuleRuntime
	var sessions []tunnel.SessionInfo
	if s.hub != nil {
		rt = s.hub.RuntimeStatus()
		sessions = s.hub.ListSessions()
	}
	if rt == nil {
		rt = map[uint]tunnel.RuleRuntime{}
	}
	return list, rt, sessions, nil
}

// Sessions 当前隧道会话。
func (s *TunnelService) Sessions() []tunnel.SessionInfo {
	if s.hub == nil {
		return nil
	}
	return s.hub.ListSessions()
}

// Get 单条。
func (s *TunnelService) Get(id uint) (*model.TunnelRule, *tunnel.RuleRuntime, error) {
	m, err := s.repo.GetByID(id)
	if err != nil {
		return nil, nil, ErrTunnelNotFound
	}
	var rt *tunnel.RuleRuntime
	if s.hub != nil {
		all := s.hub.RuntimeStatus()
		if v, ok := all[id]; ok {
			cp := v
			rt = &cp
		}
	}
	return m, rt, nil
}

// CreateInput 创建参数。
type TunnelCreateInput struct {
	Code           string `json:"code"`
	Name           string `json:"name"`
	Enabled        *bool  `json:"enabled"`
	AgentID        string `json:"agent_id"`
	ListenHost     string `json:"listen_host"`
	ListenPort     int    `json:"listen_port"`
	RemoteHost     string `json:"remote_host"`
	RemotePort     int    `json:"remote_port"`
	MaxConns       *int   `json:"max_conns"`
	IdleTimeoutSec *int   `json:"idle_timeout_sec"`
	Description    string `json:"description"`
	AllowAnyRemote bool   `json:"-"` // 仅服务内部校验用
}

// Create 新建规则。
func (s *TunnelService) Create(in TunnelCreateInput) (*model.TunnelRule, error) {
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	agentID := strings.TrimSpace(in.AgentID)
	if code == "" || !tunnelCodeRe.MatchString(code) {
		return nil, fmt.Errorf("%w: code 须为字母数字_-", ErrTunnelInvalid)
	}
	if name == "" {
		return nil, fmt.Errorf("%w: name 必填", ErrTunnelInvalid)
	}
	if agentID == "" {
		return nil, fmt.Errorf("%w: agent_id 必填", ErrTunnelInvalid)
	}
	if in.ListenPort <= 0 || in.ListenPort > 65535 {
		return nil, fmt.Errorf("%w: listen_port 无效", ErrTunnelInvalid)
	}
	remoteHost := strings.TrimSpace(in.RemoteHost)
	if remoteHost == "" {
		remoteHost = "127.0.0.1"
	}
	if in.RemotePort <= 0 || in.RemotePort > 65535 {
		return nil, fmt.Errorf("%w: remote_port 无效", ErrTunnelInvalid)
	}
	if !tunnel.IsAllowedRemote(remoteHost, in.AllowAnyRemote) {
		return nil, fmt.Errorf("%w: remote_host 仅允许 loopback/私网地址", ErrTunnelInvalid)
	}
	if err := s.checkPortFree(in.ListenPort, 0); err != nil {
		return nil, err
	}

	en := true
	if in.Enabled != nil {
		en = *in.Enabled
	}
	maxC := 64
	if in.MaxConns != nil && *in.MaxConns >= 0 {
		maxC = *in.MaxConns
	}
	idle := 0
	if in.IdleTimeoutSec != nil && *in.IdleTimeoutSec >= 0 {
		idle = *in.IdleTimeoutSec
	}

	m := &model.TunnelRule{
		Code:           code,
		Name:           name,
		Enabled:        en,
		Mode:           model.TunnelModeReverseTCP,
		AgentID:        agentID,
		ListenHost:     strings.TrimSpace(in.ListenHost),
		ListenPort:     in.ListenPort,
		RemoteHost:     remoteHost,
		RemotePort:     in.RemotePort,
		MaxConns:       maxC,
		IdleTimeoutSec: idle,
		Description:    in.Description,
	}
	if err := s.repo.Create(m); err != nil {
		if isUniqueErr(err) {
			return nil, fmt.Errorf("%w: code 或 listen_port 已存在", ErrTunnelConflict)
		}
		return nil, err
	}
	_ = s.Reload()
	return m, nil
}

// UpdateInput 更新。
type TunnelUpdateInput struct {
	Name           *string `json:"name"`
	Enabled        *bool   `json:"enabled"`
	AgentID        *string `json:"agent_id"`
	ListenHost     *string `json:"listen_host"`
	ListenPort     *int    `json:"listen_port"`
	RemoteHost     *string `json:"remote_host"`
	RemotePort     *int    `json:"remote_port"`
	MaxConns       *int    `json:"max_conns"`
	IdleTimeoutSec *int    `json:"idle_timeout_sec"`
	Description    *string `json:"description"`
	AllowAnyRemote bool    `json:"-"`
}

// Update 更新。
func (s *TunnelService) Update(id uint, in TunnelUpdateInput) (*model.TunnelRule, error) {
	m, err := s.repo.GetByID(id)
	if err != nil {
		return nil, ErrTunnelNotFound
	}
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" {
			return nil, fmt.Errorf("%w: name 不能为空", ErrTunnelInvalid)
		}
		m.Name = n
	}
	if in.Enabled != nil {
		m.Enabled = *in.Enabled
	}
	if in.AgentID != nil {
		a := strings.TrimSpace(*in.AgentID)
		if a == "" {
			return nil, fmt.Errorf("%w: agent_id 不能为空", ErrTunnelInvalid)
		}
		m.AgentID = a
	}
	if in.ListenHost != nil {
		m.ListenHost = strings.TrimSpace(*in.ListenHost)
	}
	if in.ListenPort != nil {
		if *in.ListenPort <= 0 || *in.ListenPort > 65535 {
			return nil, fmt.Errorf("%w: listen_port 无效", ErrTunnelInvalid)
		}
		if err := s.checkPortFree(*in.ListenPort, id); err != nil {
			return nil, err
		}
		m.ListenPort = *in.ListenPort
	}
	if in.RemoteHost != nil {
		rh := strings.TrimSpace(*in.RemoteHost)
		if rh == "" {
			rh = "127.0.0.1"
		}
		if !tunnel.IsAllowedRemote(rh, in.AllowAnyRemote) {
			return nil, fmt.Errorf("%w: remote_host 仅允许 loopback/私网地址", ErrTunnelInvalid)
		}
		m.RemoteHost = rh
	}
	if in.RemotePort != nil {
		if *in.RemotePort <= 0 || *in.RemotePort > 65535 {
			return nil, fmt.Errorf("%w: remote_port 无效", ErrTunnelInvalid)
		}
		m.RemotePort = *in.RemotePort
	}
	if in.MaxConns != nil && *in.MaxConns >= 0 {
		m.MaxConns = *in.MaxConns
	}
	if in.IdleTimeoutSec != nil && *in.IdleTimeoutSec >= 0 {
		m.IdleTimeoutSec = *in.IdleTimeoutSec
	}
	if in.Description != nil {
		m.Description = *in.Description
	}
	if err := s.repo.Update(m); err != nil {
		if isUniqueErr(err) {
			return nil, fmt.Errorf("%w: listen_port 冲突", ErrTunnelConflict)
		}
		return nil, err
	}
	_ = s.Reload()
	return m, nil
}

// Delete 删除。
func (s *TunnelService) Delete(id uint) error {
	if _, err := s.repo.GetByID(id); err != nil {
		return ErrTunnelNotFound
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	_ = s.Reload()
	return nil
}

// SetEnabled 启停。
func (s *TunnelService) SetEnabled(id uint, enabled bool) (*model.TunnelRule, error) {
	return s.Update(id, TunnelUpdateInput{Enabled: &enabled})
}

func (s *TunnelService) checkPortFree(port int, exceptID uint) error {
	// 隧道规则
	if existing, err := s.repo.GetByListenPort(port); err == nil && existing != nil && existing.ID != exceptID {
		return fmt.Errorf("%w: listen_port %d 已被隧道规则占用", ErrTunnelConflict, port)
	}
	// 站点端口
	if s.portRepo != nil {
		if p, err := s.portRepo.GetByPort(port); err == nil && p != nil {
			return fmt.Errorf("%w: listen_port %d 已被站点占用", ErrTunnelConflict, port)
		}
	}
	// 粗测本机是否已被占用(非必须,仅提示)
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		// 若仅更新同一规则端口不变,调用方应先 except;这里端口可能是自己在听
		// 不强制失败,由 Hub Apply 报错
		_ = err
	} else {
		_ = ln.Close()
	}
	return nil
}

func isUniqueErr(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "unique") || strings.Contains(s, "constraint")
}

// SanitizeCode 辅助。
func SanitizeCode(s string) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
