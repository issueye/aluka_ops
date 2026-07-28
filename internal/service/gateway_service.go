package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/repository"
)

var (
	ErrGatewayNotFound   = errors.New("网关规则不存在")
	ErrGatewayCodeExists = errors.New("规则编码已存在")
	ErrGatewayInvalid    = errors.New("规则参数无效")
	ErrGatewayPortBusy   = errors.New("端口无法监听")
)

var codeRe = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{1,62}$`)

// GatewayService 旧扁平网关规则(兼容)。
// 运行时 Apply 由 AppGatewayService.Reload 统一负责,避免互相覆盖。
type GatewayService struct {
	repo   *repository.GatewayRepository
	mgr    *gateway.Manager
	reload func() error // 注入统一 Reload
}

func NewGatewayService(repo *repository.GatewayRepository, mgr *gateway.Manager) *GatewayService {
	return &GatewayService{repo: repo, mgr: mgr}
}

// SetReload 注入统一重载(端口/APP/反代/旧规则)。
func (s *GatewayService) SetReload(fn func() error) { s.reload = fn }

// Reload 从 DB 加载启用规则并 Apply。
func (s *GatewayService) Reload() error {
	if s.reload != nil {
		return s.reload()
	}
	list, err := s.repo.ListEnabled()
	if err != nil {
		return err
	}
	return s.mgr.Apply(list)
}

func (s *GatewayService) List() ([]model.GatewayRule, error) {
	return s.repo.List()
}

func (s *GatewayService) Get(id uint) (*model.GatewayRule, error) {
	m, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrGatewayNotFound
		}
		return nil, err
	}
	return m, nil
}

// RuntimeStatus 当前监听端口状态。
func (s *GatewayService) RuntimeStatus() []map[string]any {
	return s.mgr.Status()
}

// CreateInput 创建入参。
type GatewayCreateInput struct {
	Name                     string `json:"name"`
	Code                     string `json:"code"`
	Type                     string `json:"type"`
	Enabled                  bool   `json:"enabled"`
	ListenPort               int    `json:"listen_port"`
	PathPrefix               string `json:"path_prefix"`
	StripPrefix              *bool  `json:"strip_prefix"`
	RootDir                  string `json:"root_dir"`
	SPAFallback              *bool  `json:"spa_fallback"`
	Upstream                 string `json:"upstream"`
	ConnectTimeoutSec        int    `json:"connect_timeout_sec"`
	ResponseHeaderTimeoutSec int    `json:"response_header_timeout_sec"`
	IOTimeoutSec             int    `json:"io_timeout_sec"`
	MaxBodyBytes             int64  `json:"max_body_bytes"`
	PassHost                 bool   `json:"pass_host"`
	ExtraHeaders             any    `json:"extra_headers"` // map or JSON string
	EnableWebSocket          *bool  `json:"enable_websocket"`
	Description              string `json:"description"`
	Sort                     int    `json:"sort"`
}

func (s *GatewayService) Create(in GatewayCreateInput) (*model.GatewayRule, error) {
	m, err := s.buildRule(in, nil)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.GetByCode(m.Code); err == nil {
		return nil, ErrGatewayCodeExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err := s.repo.Create(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		// 监听失败时回写禁用,避免状态撒谎
		if m.Enabled {
			m.Enabled = false
			_ = s.repo.Update(m)
		}
		return m, fmt.Errorf("%w: %v", ErrGatewayPortBusy, err)
	}
	return m, nil
}

// UpdateInput 更新(指针表示可选)。
type GatewayUpdateInput struct {
	Name                     *string `json:"name"`
	Type                     *string `json:"type"`
	Enabled                  *bool   `json:"enabled"`
	ListenPort               *int    `json:"listen_port"`
	PathPrefix               *string `json:"path_prefix"`
	StripPrefix              *bool   `json:"strip_prefix"`
	RootDir                  *string `json:"root_dir"`
	SPAFallback              *bool   `json:"spa_fallback"`
	Upstream                 *string `json:"upstream"`
	ConnectTimeoutSec        *int    `json:"connect_timeout_sec"`
	ResponseHeaderTimeoutSec *int    `json:"response_header_timeout_sec"`
	IOTimeoutSec             *int    `json:"io_timeout_sec"`
	MaxBodyBytes             *int64  `json:"max_body_bytes"`
	PassHost                 *bool   `json:"pass_host"`
	ExtraHeaders             any     `json:"extra_headers"`
	EnableWebSocket          *bool   `json:"enable_websocket"`
	Description              *string `json:"description"`
	Sort                     *int    `json:"sort"`
}

func (s *GatewayService) Update(id uint, in GatewayUpdateInput) (*model.GatewayRule, error) {
	m, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	// 合并到 CreateInput 风格校验
	ci := GatewayCreateInput{
		Name:                     m.Name,
		Code:                     m.Code,
		Type:                     string(m.Type),
		Enabled:                  m.Enabled,
		ListenPort:               m.ListenPort,
		PathPrefix:               m.PathPrefix,
		RootDir:                  m.RootDir,
		Upstream:                 m.Upstream,
		ConnectTimeoutSec:        m.ConnectTimeoutSec,
		ResponseHeaderTimeoutSec: m.ResponseHeaderTimeoutSec,
		IOTimeoutSec:             m.IOTimeoutSec,
		MaxBodyBytes:             m.MaxBodyBytes,
		PassHost:                 m.PassHost,
		Description:              m.Description,
		Sort:                     m.Sort,
	}
	sp, spa, ews := m.StripPrefix, m.SPAFallback, m.EnableWebSocket
	ci.StripPrefix, ci.SPAFallback, ci.EnableWebSocket = &sp, &spa, &ews
	if in.Name != nil {
		ci.Name = *in.Name
	}
	if in.Type != nil {
		ci.Type = *in.Type
	}
	if in.Enabled != nil {
		ci.Enabled = *in.Enabled
	}
	if in.ListenPort != nil {
		ci.ListenPort = *in.ListenPort
	}
	if in.PathPrefix != nil {
		ci.PathPrefix = *in.PathPrefix
	}
	if in.StripPrefix != nil {
		ci.StripPrefix = in.StripPrefix
	}
	if in.RootDir != nil {
		ci.RootDir = *in.RootDir
	}
	if in.SPAFallback != nil {
		ci.SPAFallback = in.SPAFallback
	}
	if in.Upstream != nil {
		ci.Upstream = *in.Upstream
	}
	if in.ConnectTimeoutSec != nil {
		ci.ConnectTimeoutSec = *in.ConnectTimeoutSec
	}
	if in.ResponseHeaderTimeoutSec != nil {
		ci.ResponseHeaderTimeoutSec = *in.ResponseHeaderTimeoutSec
	}
	if in.IOTimeoutSec != nil {
		ci.IOTimeoutSec = *in.IOTimeoutSec
	}
	if in.MaxBodyBytes != nil {
		ci.MaxBodyBytes = *in.MaxBodyBytes
	}
	if in.PassHost != nil {
		ci.PassHost = *in.PassHost
	}
	if in.ExtraHeaders != nil {
		ci.ExtraHeaders = in.ExtraHeaders
	} else if m.ExtraHeaders != "" {
		ci.ExtraHeaders = m.ExtraHeaders
	}
	if in.EnableWebSocket != nil {
		ci.EnableWebSocket = in.EnableWebSocket
	}
	if in.Description != nil {
		ci.Description = *in.Description
	}
	if in.Sort != nil {
		ci.Sort = *in.Sort
	}

	built, err := s.buildRule(ci, m)
	if err != nil {
		return nil, err
	}
	built.ID = m.ID
	built.CreatedAt = m.CreatedAt
	if err := s.repo.Update(built); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return built, fmt.Errorf("%w: %v", ErrGatewayPortBusy, err)
	}
	return built, nil
}

func (s *GatewayService) Delete(id uint) error {
	if _, err := s.Get(id); err != nil {
		return err
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	return s.Reload()
}

func (s *GatewayService) SetEnabled(id uint, enabled bool) (*model.GatewayRule, error) {
	return s.Update(id, GatewayUpdateInput{Enabled: &enabled})
}

func (s *GatewayService) buildRule(in GatewayCreateInput, existing *model.GatewayRule) (*model.GatewayRule, error) {
	name := strings.TrimSpace(in.Name)
	code := strings.TrimSpace(in.Code)
	if name == "" {
		return nil, fmt.Errorf("%w: name 必填", ErrGatewayInvalid)
	}
	if existing == nil {
		if !codeRe.MatchString(code) {
			return nil, fmt.Errorf("%w: code 须为字母开头的 2-63 位 [A-Za-z0-9_-]", ErrGatewayInvalid)
		}
	} else {
		code = existing.Code
	}
	typ := model.GatewayRuleType(strings.ToLower(strings.TrimSpace(in.Type)))
	if typ != model.GatewayTypeStatic && typ != model.GatewayTypeProxy {
		return nil, fmt.Errorf("%w: type 须为 static 或 proxy", ErrGatewayInvalid)
	}
	if in.ListenPort < 1 || in.ListenPort > 65535 {
		return nil, fmt.Errorf("%w: listen_port 无效", ErrGatewayInvalid)
	}
	// 禁止占用管理面常见端口? 不硬禁,只警告在文档
	prefix := strings.TrimSpace(in.PathPrefix)
	if prefix == "" {
		prefix = "/"
	}
	if !strings.HasPrefix(prefix, "/") {
		prefix = "/" + prefix
	}

	strip := true
	if in.StripPrefix != nil {
		strip = *in.StripPrefix
	}
	spa := true
	if in.SPAFallback != nil {
		spa = *in.SPAFallback
	}
	ews := true
	if in.EnableWebSocket != nil {
		ews = *in.EnableWebSocket
	}

	// 默认超时:上传友好
	cto, rhto, ioto := in.ConnectTimeoutSec, in.ResponseHeaderTimeoutSec, in.IOTimeoutSec
	if cto <= 0 {
		cto = 10
	}
	if rhto <= 0 {
		rhto = 60
	}
	if ioto <= 0 {
		// 0 表示不设整体超时;创建时默认 0 更适合大上传
		// 若用户显式传了正数则用
		ioto = 0
	}

	extra := ""
	if in.ExtraHeaders != nil {
		switch v := in.ExtraHeaders.(type) {
		case string:
			extra = strings.TrimSpace(v)
			if extra != "" {
				var tmp map[string]string
				if err := json.Unmarshal([]byte(extra), &tmp); err != nil {
					return nil, fmt.Errorf("%w: extra_headers JSON 无效", ErrGatewayInvalid)
				}
			}
		default:
			b, err := json.Marshal(v)
			if err != nil {
				return nil, fmt.Errorf("%w: extra_headers 无效", ErrGatewayInvalid)
			}
			extra = string(b)
		}
	}

	m := &model.GatewayRule{
		Name:                     name,
		Code:                     code,
		Type:                     typ,
		Enabled:                  in.Enabled,
		ListenPort:               in.ListenPort,
		PathPrefix:               prefix,
		StripPrefix:              strip,
		RootDir:                  strings.TrimSpace(in.RootDir),
		SPAFallback:              spa,
		Upstream:                 strings.TrimSpace(in.Upstream),
		ConnectTimeoutSec:        cto,
		ResponseHeaderTimeoutSec: rhto,
		IOTimeoutSec:             ioto,
		MaxBodyBytes:             in.MaxBodyBytes, // 0=无限,上传推荐
		PassHost:                 in.PassHost,
		ExtraHeaders:             extra,
		EnableWebSocket:          ews,
		Description:              in.Description,
		Sort:                     in.Sort,
	}
	if typ == model.GatewayTypeStatic && m.RootDir == "" {
		return nil, fmt.Errorf("%w: static 需要 root_dir", ErrGatewayInvalid)
	}
	if typ == model.GatewayTypeProxy && m.Upstream == "" {
		return nil, fmt.Errorf("%w: proxy 需要 upstream", ErrGatewayInvalid)
	}
	if typ == model.GatewayTypeProxy && !strings.HasPrefix(m.Upstream, "http://") && !strings.HasPrefix(m.Upstream, "https://") {
		return nil, fmt.Errorf("%w: upstream 须以 http:// 或 https:// 开头", ErrGatewayInvalid)
	}
	return m, nil
}

// ProbePort 探测端口是否可绑定(辅助前端)。
func ProbePort(port int) error {
	if port < 1 || port > 65535 {
		return ErrGatewayInvalid
	}
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return err
	}
	_ = ln.Close()
	return nil
}
