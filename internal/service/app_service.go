package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/repository"
)

var (
	ErrPortNotFound     = errors.New("代理端口不存在")
	ErrPortExists       = errors.New("端口已存在")
	ErrPortInUse        = errors.New("端口下仍有 APP/反代/脚本")
	ErrAppNotFound      = errors.New("APP 不存在")
	ErrAppCodeExists    = errors.New("APP 编码已存在")
	ErrProxyNotFound    = errors.New("反代规则不存在")
	ErrProxyCodeExists  = errors.New("反代编码已存在")
	ErrScriptNotFound   = errors.New("路由脚本不存在")
	ErrScriptCodeExists = errors.New("脚本编码已存在")
	ErrAppInvalid       = errors.New("参数无效")
	ErrListenFailed     = errors.New("端口监听失败")
)

var appCodeRe = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{1,62}$`)

// AppGatewayService 代理端口 + APP + 端口反代 + 路由脚本 的业务与运行时同步。
type AppGatewayService struct {
	ports   *repository.GatewayPortRepository
	apps    *repository.AppRepository
	proxies *repository.PortProxyRepository
	scripts *repository.PortScriptRepository
	legacy  *repository.GatewayRepository // 可选:旧扁平规则
	mgr     *gateway.Manager
	dataDir string
}

func NewAppGatewayService(
	ports *repository.GatewayPortRepository,
	apps *repository.AppRepository,
	proxies *repository.PortProxyRepository,
	scripts *repository.PortScriptRepository,
	mgr *gateway.Manager,
	dataDir string,
) *AppGatewayService {
	return &AppGatewayService{ports: ports, apps: apps, proxies: proxies, scripts: scripts, mgr: mgr, dataDir: dataDir}
}

// SetLegacyRepo 注入旧 gateway_rules 仓库,Reload 时合并。
func (s *AppGatewayService) SetLegacyRepo(repo *repository.GatewayRepository) {
	s.legacy = repo
}

// Reload 编译启用中的端口/APP/反代/脚本(+旧规则) → 运行时。
func (s *AppGatewayService) Reload() error {
	list, err := s.ports.ListEnabledRuntime()
	if err != nil {
		return err
	}
	cfgs, err := compilePortConfigs(list, s.dataDir)
	if err != nil {
		return err
	}
	if s.legacy != nil {
		if old, err := s.legacy.ListEnabled(); err == nil && len(old) > 0 {
			legacyCfgs := gateway.RulesToPortConfigs(old, s.dataDir)
			cfgs = mergePortConfigs(cfgs, legacyCfgs)
		}
	}
	return s.mgr.ApplyPorts(cfgs)
}

func (s *AppGatewayService) RuntimeStatus() []map[string]any {
	return s.mgr.Status()
}

// ===== Port CRUD =====

type PortCreateInput struct {
	Port        int    `json:"port"`
	Name        string `json:"name"`
	Enabled     *bool  `json:"enabled"`
	Description string `json:"description"`
	IPWhitelist string `json:"ip_whitelist"`
	IPBlacklist string `json:"ip_blacklist"`
}

func (s *AppGatewayService) ListPorts() ([]model.GatewayPort, error) {
	return s.ports.List()
}

func (s *AppGatewayService) ListPortsSimple() ([]model.GatewayPort, error) {
	return s.ports.ListSimple()
}

func (s *AppGatewayService) GetPort(id uint) (*model.GatewayPort, error) {
	m, err := s.ports.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPortNotFound
		}
		return nil, err
	}
	return m, nil
}

func (s *AppGatewayService) CreatePort(in PortCreateInput) (*model.GatewayPort, error) {
	if in.Port < 1 || in.Port > 65535 {
		return nil, fmt.Errorf("%w: port 无效", ErrAppInvalid)
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = fmt.Sprintf("端口 %d", in.Port)
	}
	if _, err := s.ports.GetByPort(in.Port); err == nil {
		return nil, ErrPortExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	en := true
	if in.Enabled != nil {
		en = *in.Enabled
	}
	if _, err := gateway.NewIPFilter(in.IPWhitelist, in.IPBlacklist); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrAppInvalid, err)
	}
	m := &model.GatewayPort{
		Port:        in.Port,
		Name:        name,
		Enabled:     en,
		Description: in.Description,
		IPWhitelist: strings.TrimSpace(in.IPWhitelist),
		IPBlacklist: strings.TrimSpace(in.IPBlacklist),
	}
	if err := s.ports.Create(m); err != nil {
		return nil, err
	}
	_ = s.Reload()
	return m, nil
}

type PortUpdateInput struct {
	Name        *string `json:"name"`
	Enabled     *bool   `json:"enabled"`
	Description *string `json:"description"`
	IPWhitelist *string `json:"ip_whitelist"`
	IPBlacklist *string `json:"ip_blacklist"`
	// Port 不允许改端口号(避免混乱);需删建
}

func (s *AppGatewayService) UpdatePort(id uint, in PortUpdateInput) (*model.GatewayPort, error) {
	m, err := s.GetPort(id)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" {
			return nil, fmt.Errorf("%w: name 不能为空", ErrAppInvalid)
		}
		m.Name = n
	}
	if in.Enabled != nil {
		m.Enabled = *in.Enabled
	}
	if in.Description != nil {
		m.Description = *in.Description
	}
	wl, bl := m.IPWhitelist, m.IPBlacklist
	if in.IPWhitelist != nil {
		wl = strings.TrimSpace(*in.IPWhitelist)
	}
	if in.IPBlacklist != nil {
		bl = strings.TrimSpace(*in.IPBlacklist)
	}
	if _, err := gateway.NewIPFilter(wl, bl); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrAppInvalid, err)
	}
	m.IPWhitelist = wl
	m.IPBlacklist = bl
	if err := s.ports.Update(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return m, fmt.Errorf("%w: %v", ErrListenFailed, err)
	}
	return m, nil
}

func (s *AppGatewayService) DeletePort(id uint, force bool) error {
	if _, err := s.GetPort(id); err != nil {
		return err
	}
	if !force {
		na, _ := s.apps.CountByPort(id)
		np, _ := s.proxies.CountByPort(id)
		ns := int64(0)
		if s.scripts != nil {
			ns, _ = s.scripts.CountByPort(id)
		}
		if na > 0 || np > 0 || ns > 0 {
			return fmt.Errorf("%w: APP=%d 反代=%d 脚本=%d(传 force=true 可级联删除)", ErrPortInUse, na, np, ns)
		}
	}
	if err := s.ports.Delete(id); err != nil {
		return err
	}
	return s.Reload()
}

// ===== App CRUD =====

type AppCreateInput struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     *bool  `json:"enabled"`
	PortID      uint   `json:"port_id"`
	PathPrefix  string `json:"path_prefix"`
	StripPrefix *bool  `json:"strip_prefix"`
	RootDir     string `json:"root_dir"`
	SPAFallback *bool  `json:"spa_fallback"`
}

func (s *AppGatewayService) ListApps() ([]model.App, error) {
	return s.apps.List()
}

func (s *AppGatewayService) GetApp(id uint) (*model.App, error) {
	m, err := s.apps.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAppNotFound
		}
		return nil, err
	}
	return m, nil
}

func (s *AppGatewayService) CreateApp(in AppCreateInput) (*model.App, error) {
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	if !appCodeRe.MatchString(code) {
		return nil, fmt.Errorf("%w: code 须为字母开头的 2-63 位", ErrAppInvalid)
	}
	if name == "" {
		return nil, fmt.Errorf("%w: name 必填", ErrAppInvalid)
	}
	if _, err := s.GetPort(in.PortID); err != nil {
		return nil, err
	}
	if _, err := s.apps.GetByCode(code); err == nil {
		return nil, ErrAppCodeExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	en, strip, spa := true, true, true
	if in.Enabled != nil {
		en = *in.Enabled
	}
	if in.StripPrefix != nil {
		strip = *in.StripPrefix
	}
	if in.SPAFallback != nil {
		spa = *in.SPAFallback
	}
	prefix := normalizePathPrefix(in.PathPrefix)
	root := strings.TrimSpace(in.RootDir)
	if root == "" {
		root = filepath.ToSlash(filepath.Join("apps", code))
	}
	// 确保目录存在
	absRoot := root
	if !filepath.IsAbs(absRoot) {
		absRoot = filepath.Join(s.dataDir, absRoot)
	}
	_ = os.MkdirAll(absRoot, 0o755)

	m := &model.App{
		Code:        code,
		Name:        name,
		Description: in.Description,
		Enabled:     en,
		PortID:      in.PortID,
		PathPrefix:  prefix,
		StripPrefix: strip,
		RootDir:     root,
		SPAFallback: spa,
	}
	if err := s.apps.Create(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return m, fmt.Errorf("%w: %v", ErrListenFailed, err)
	}
	return s.GetApp(m.ID)
}

type AppUpdateInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Enabled     *bool   `json:"enabled"`
	PortID      *uint   `json:"port_id"`
	PathPrefix  *string `json:"path_prefix"`
	StripPrefix *bool   `json:"strip_prefix"`
	RootDir     *string `json:"root_dir"`
	SPAFallback *bool   `json:"spa_fallback"`
}

func (s *AppGatewayService) UpdateApp(id uint, in AppUpdateInput) (*model.App, error) {
	m, err := s.GetApp(id)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" {
			return nil, fmt.Errorf("%w: name 不能为空", ErrAppInvalid)
		}
		m.Name = n
	}
	if in.Description != nil {
		m.Description = *in.Description
	}
	if in.Enabled != nil {
		m.Enabled = *in.Enabled
	}
	if in.PortID != nil {
		if _, err := s.GetPort(*in.PortID); err != nil {
			return nil, err
		}
		m.PortID = *in.PortID
	}
	if in.PathPrefix != nil {
		m.PathPrefix = normalizePathPrefix(*in.PathPrefix)
	}
	if in.StripPrefix != nil {
		m.StripPrefix = *in.StripPrefix
	}
	if in.RootDir != nil {
		m.RootDir = strings.TrimSpace(*in.RootDir)
	}
	if in.SPAFallback != nil {
		m.SPAFallback = *in.SPAFallback
	}
	if err := s.apps.Update(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return m, fmt.Errorf("%w: %v", ErrListenFailed, err)
	}
	return s.GetApp(id)
}

func (s *AppGatewayService) DeleteApp(id uint) error {
	if _, err := s.GetApp(id); err != nil {
		return err
	}
	if err := s.apps.Delete(id); err != nil {
		return err
	}
	return s.Reload()
}

// ===== Port Proxy CRUD =====

type ProxyCreateInput struct {
	PortID                   uint   `json:"port_id"`
	Name                     string `json:"name"`
	Code                     string `json:"code"`
	Enabled                  *bool  `json:"enabled"`
	PathPrefix               string `json:"path_prefix"`
	StripPrefix              *bool  `json:"strip_prefix"`
	Upstream                 string `json:"upstream"`
	ConnectTimeoutSec        int    `json:"connect_timeout_sec"`
	ResponseHeaderTimeoutSec int    `json:"response_header_timeout_sec"`
	IOTimeoutSec             int    `json:"io_timeout_sec"`
	MaxBodyBytes             int64  `json:"max_body_bytes"`
	PassHost                 bool   `json:"pass_host"`
	EnableWebSocket          *bool  `json:"enable_websocket"`
	ExtraHeaders             any    `json:"extra_headers"`
	Sort                     int    `json:"sort"`
	Description              string `json:"description"`
}

func (s *AppGatewayService) ListProxies() ([]model.PortProxyRule, error) {
	return s.proxies.List()
}

func (s *AppGatewayService) ListProxiesByPort(portID uint) ([]model.PortProxyRule, error) {
	return s.proxies.ListByPort(portID)
}

func (s *AppGatewayService) GetProxy(id uint) (*model.PortProxyRule, error) {
	m, err := s.proxies.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrProxyNotFound
		}
		return nil, err
	}
	return m, nil
}

func (s *AppGatewayService) CreateProxy(in ProxyCreateInput) (*model.PortProxyRule, error) {
	if _, err := s.GetPort(in.PortID); err != nil {
		return nil, err
	}
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	if !appCodeRe.MatchString(code) {
		return nil, fmt.Errorf("%w: code 无效", ErrAppInvalid)
	}
	if name == "" {
		return nil, fmt.Errorf("%w: name 必填", ErrAppInvalid)
	}
	up := strings.TrimSpace(in.Upstream)
	if !strings.HasPrefix(up, "http://") && !strings.HasPrefix(up, "https://") {
		return nil, fmt.Errorf("%w: upstream 须 http(s)://", ErrAppInvalid)
	}
	if _, err := s.proxies.GetByCode(code); err == nil {
		return nil, ErrProxyCodeExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	en, strip, ews := true, true, true
	if in.Enabled != nil {
		en = *in.Enabled
	}
	if in.StripPrefix != nil {
		strip = *in.StripPrefix
	}
	if in.EnableWebSocket != nil {
		ews = *in.EnableWebSocket
	}
	cto, rhto := in.ConnectTimeoutSec, in.ResponseHeaderTimeoutSec
	if cto <= 0 {
		cto = 10
	}
	if rhto <= 0 {
		rhto = 60
	}
	extra := marshalExtra(in.ExtraHeaders)
	m := &model.PortProxyRule{
		PortID:                   in.PortID,
		Name:                     name,
		Code:                     code,
		Enabled:                  en,
		PathPrefix:               normalizePathPrefix(in.PathPrefix),
		StripPrefix:              strip,
		Upstream:                 up,
		ConnectTimeoutSec:        cto,
		ResponseHeaderTimeoutSec: rhto,
		IOTimeoutSec:             in.IOTimeoutSec, // 允许 0
		MaxBodyBytes:             in.MaxBodyBytes,
		PassHost:                 in.PassHost,
		EnableWebSocket:          ews,
		ExtraHeaders:             extra,
		Sort:                     in.Sort,
		Description:              in.Description,
	}
	if err := s.proxies.Create(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return m, fmt.Errorf("%w: %v", ErrListenFailed, err)
	}
	return s.GetProxy(m.ID)
}

type ProxyUpdateInput struct {
	Name                     *string `json:"name"`
	Enabled                  *bool   `json:"enabled"`
	PortID                   *uint   `json:"port_id"`
	PathPrefix               *string `json:"path_prefix"`
	StripPrefix              *bool   `json:"strip_prefix"`
	Upstream                 *string `json:"upstream"`
	ConnectTimeoutSec        *int    `json:"connect_timeout_sec"`
	ResponseHeaderTimeoutSec *int    `json:"response_header_timeout_sec"`
	IOTimeoutSec             *int    `json:"io_timeout_sec"`
	MaxBodyBytes             *int64  `json:"max_body_bytes"`
	PassHost                 *bool   `json:"pass_host"`
	EnableWebSocket          *bool   `json:"enable_websocket"`
	ExtraHeaders             any     `json:"extra_headers"`
	Sort                     *int    `json:"sort"`
	Description              *string `json:"description"`
}

func (s *AppGatewayService) UpdateProxy(id uint, in ProxyUpdateInput) (*model.PortProxyRule, error) {
	m, err := s.GetProxy(id)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" {
			return nil, fmt.Errorf("%w: name 不能为空", ErrAppInvalid)
		}
		m.Name = n
	}
	if in.Enabled != nil {
		m.Enabled = *in.Enabled
	}
	if in.PortID != nil {
		if _, err := s.GetPort(*in.PortID); err != nil {
			return nil, err
		}
		m.PortID = *in.PortID
	}
	if in.PathPrefix != nil {
		m.PathPrefix = normalizePathPrefix(*in.PathPrefix)
	}
	if in.StripPrefix != nil {
		m.StripPrefix = *in.StripPrefix
	}
	if in.Upstream != nil {
		up := strings.TrimSpace(*in.Upstream)
		if !strings.HasPrefix(up, "http://") && !strings.HasPrefix(up, "https://") {
			return nil, fmt.Errorf("%w: upstream 无效", ErrAppInvalid)
		}
		m.Upstream = up
	}
	if in.ConnectTimeoutSec != nil {
		m.ConnectTimeoutSec = *in.ConnectTimeoutSec
	}
	if in.ResponseHeaderTimeoutSec != nil {
		m.ResponseHeaderTimeoutSec = *in.ResponseHeaderTimeoutSec
	}
	if in.IOTimeoutSec != nil {
		m.IOTimeoutSec = *in.IOTimeoutSec
	}
	if in.MaxBodyBytes != nil {
		m.MaxBodyBytes = *in.MaxBodyBytes
	}
	if in.PassHost != nil {
		m.PassHost = *in.PassHost
	}
	if in.EnableWebSocket != nil {
		m.EnableWebSocket = *in.EnableWebSocket
	}
	if in.ExtraHeaders != nil {
		m.ExtraHeaders = marshalExtra(in.ExtraHeaders)
	}
	if in.Sort != nil {
		m.Sort = *in.Sort
	}
	if in.Description != nil {
		m.Description = *in.Description
	}
	if err := s.proxies.Update(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return m, fmt.Errorf("%w: %v", ErrListenFailed, err)
	}
	return s.GetProxy(id)
}

func (s *AppGatewayService) DeleteProxy(id uint) error {
	if _, err := s.GetProxy(id); err != nil {
		return err
	}
	if err := s.proxies.Delete(id); err != nil {
		return err
	}
	return s.Reload()
}

// ===== 路由脚本 CRUD =====

type ScriptCreateInput struct {
	PortID      uint   `json:"port_id"`
	Name        string `json:"name"`
	Code        string `json:"code"`
	Enabled     *bool  `json:"enabled"`
	PathPrefix  string `json:"path_prefix"`
	Priority    int    `json:"priority"`
	Script      string `json:"script"`
	Description string `json:"description"`
}

// ListScriptTemplates 内置路由脚本预设。
func (s *AppGatewayService) ListScriptTemplates() []gateway.ScriptTemplate {
	return gateway.BuiltinScriptTemplates()
}

// GetScriptTemplate 按 id 取预设。
func (s *AppGatewayService) GetScriptTemplate(id string) (*gateway.ScriptTemplate, error) {
	t := gateway.FindScriptTemplate(id)
	if t == nil {
		return nil, fmt.Errorf("%w: 模板不存在", ErrAppInvalid)
	}
	return t, nil
}

func (s *AppGatewayService) ListScripts() ([]model.PortRouteScript, error) {
	if s.scripts == nil {
		return nil, nil
	}
	return s.scripts.List()
}

func (s *AppGatewayService) ListScriptsByPort(portID uint) ([]model.PortRouteScript, error) {
	if s.scripts == nil {
		return nil, nil
	}
	return s.scripts.ListByPort(portID)
}

func (s *AppGatewayService) GetScript(id uint) (*model.PortRouteScript, error) {
	if s.scripts == nil {
		return nil, ErrScriptNotFound
	}
	m, err := s.scripts.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrScriptNotFound
		}
		return nil, err
	}
	return m, nil
}

func (s *AppGatewayService) CreateScript(in ScriptCreateInput) (*model.PortRouteScript, error) {
	if s.scripts == nil {
		return nil, fmt.Errorf("%w: scripts 未初始化", ErrAppInvalid)
	}
	if _, err := s.GetPort(in.PortID); err != nil {
		return nil, err
	}
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	if !appCodeRe.MatchString(code) {
		return nil, fmt.Errorf("%w: code 无效", ErrAppInvalid)
	}
	if name == "" {
		return nil, fmt.Errorf("%w: name 必填", ErrAppInvalid)
	}
	if _, err := gateway.ParseScriptJSON(in.Script); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrAppInvalid, err)
	}
	if _, err := s.scripts.GetByCode(code); err == nil {
		return nil, ErrScriptCodeExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	en := true
	if in.Enabled != nil {
		en = *in.Enabled
	}
	pri := in.Priority
	if pri == 0 {
		pri = 100
	}
	m := &model.PortRouteScript{
		PortID:      in.PortID,
		Name:        name,
		Code:        code,
		Enabled:     en,
		PathPrefix:  normalizePathPrefix(in.PathPrefix),
		Priority:    pri,
		Script:      strings.TrimSpace(in.Script),
		Description: in.Description,
	}
	if err := s.scripts.Create(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return m, fmt.Errorf("%w: %v", ErrListenFailed, err)
	}
	return s.GetScript(m.ID)
}

type ScriptUpdateInput struct {
	Name        *string `json:"name"`
	Enabled     *bool   `json:"enabled"`
	PortID      *uint   `json:"port_id"`
	PathPrefix  *string `json:"path_prefix"`
	Priority    *int    `json:"priority"`
	Script      *string `json:"script"`
	Description *string `json:"description"`
}

func (s *AppGatewayService) UpdateScript(id uint, in ScriptUpdateInput) (*model.PortRouteScript, error) {
	m, err := s.GetScript(id)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" {
			return nil, fmt.Errorf("%w: name 不能为空", ErrAppInvalid)
		}
		m.Name = n
	}
	if in.Enabled != nil {
		m.Enabled = *in.Enabled
	}
	if in.PortID != nil {
		if _, err := s.GetPort(*in.PortID); err != nil {
			return nil, err
		}
		m.PortID = *in.PortID
	}
	if in.PathPrefix != nil {
		m.PathPrefix = normalizePathPrefix(*in.PathPrefix)
	}
	if in.Priority != nil {
		m.Priority = *in.Priority
	}
	if in.Script != nil {
		if _, err := gateway.ParseScriptJSON(*in.Script); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrAppInvalid, err)
		}
		m.Script = strings.TrimSpace(*in.Script)
	}
	if in.Description != nil {
		m.Description = *in.Description
	}
	if err := s.scripts.Update(m); err != nil {
		return nil, err
	}
	if err := s.Reload(); err != nil {
		return m, fmt.Errorf("%w: %v", ErrListenFailed, err)
	}
	return s.GetScript(id)
}

func (s *AppGatewayService) DeleteScript(id uint) error {
	if _, err := s.GetScript(id); err != nil {
		return err
	}
	if err := s.scripts.Delete(id); err != nil {
		return err
	}
	return s.Reload()
}

// ===== compile runtime =====

func compilePortConfigs(ports []model.GatewayPort, dataDir string) ([]gateway.PortConfig, error) {
	out := make([]gateway.PortConfig, 0, len(ports))
	for _, p := range ports {
		if !p.Enabled || p.Port <= 0 {
			continue
		}
		var rules []model.GatewayRule
		for _, pr := range p.Proxies {
			if !pr.Enabled {
				continue
			}
			rules = append(rules, model.GatewayRule{
				Base:                     model.Base{ID: pr.ID + 1000000},
				Name:                     pr.Name,
				Code:                     "px_" + pr.Code,
				Type:                     model.GatewayTypeProxy,
				Enabled:                  true,
				ListenPort:               p.Port,
				PathPrefix:               pr.PathPrefix,
				StripPrefix:              pr.StripPrefix,
				Upstream:                 pr.Upstream,
				ConnectTimeoutSec:        pr.ConnectTimeoutSec,
				ResponseHeaderTimeoutSec: pr.ResponseHeaderTimeoutSec,
				IOTimeoutSec:             pr.IOTimeoutSec,
				MaxBodyBytes:             pr.MaxBodyBytes,
				PassHost:                 pr.PassHost,
				ExtraHeaders:             pr.ExtraHeaders,
				EnableWebSocket:          pr.EnableWebSocket,
				Sort:                     pr.Sort,
			})
		}
		for _, app := range p.Apps {
			if !app.Enabled {
				continue
			}
			root := strings.TrimSpace(app.RootDir)
			if root == "" {
				root = filepath.Join("apps", app.Code)
			}
			rules = append(rules, model.GatewayRule{
				Base:        model.Base{ID: app.ID + 2000000},
				Name:        app.Name,
				Code:        "app_" + app.Code,
				Type:        model.GatewayTypeStatic,
				Enabled:     true,
				ListenPort:  p.Port,
				PathPrefix:  app.PathPrefix,
				StripPrefix: app.StripPrefix,
				RootDir:     root,
				SPAFallback: app.SPAFallback,
				Sort:        100,
			})
		}
		cfg := gateway.PortConfig{Port: p.Port}
		if len(rules) > 0 {
			for _, c := range gateway.RulesToPortConfigs(rules, dataDir) {
				if c.Port == p.Port {
					cfg.Rules = c.Rules
					break
				}
			}
		}
		for _, sc := range p.Scripts {
			if !sc.Enabled {
				continue
			}
			cs, err := gateway.CompileScript(sc.ID, sc.Code, sc.Name, sc.PathPrefix, sc.Priority, sc.Script)
			if err != nil {
				continue
			}
			cfg.Scripts = append(cfg.Scripts, *cs)
		}
		if ipf, err := gateway.NewIPFilter(p.IPWhitelist, p.IPBlacklist); err != nil {
			return nil, fmt.Errorf("站点 %d IP 过滤配置无效: %w", p.ID, err)
		} else {
			cfg.IPFilter = ipf
		}

		if len(cfg.Rules) > 0 || len(cfg.Scripts) > 0 {
			out = append(out, cfg)
		}
	}
	return out, nil
}

func mergePortConfigs(a, b []gateway.PortConfig) []gateway.PortConfig {
	m := map[int]*gateway.PortConfig{}
	for _, c := range a {
		cp := c
		m[c.Port] = &cp
	}
	for _, c := range b {
		if ex, ok := m[c.Port]; ok {
			ex.Rules = append(ex.Rules, c.Rules...)
			ex.Scripts = append(ex.Scripts, c.Scripts...)
		} else {
			cp := c
			m[c.Port] = &cp
		}
	}
	out := make([]gateway.PortConfig, 0, len(m))
	for _, v := range m {
		out = append(out, *v)
	}
	return out
}

func normalizePathPrefix(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	if len(p) > 1 {
		p = strings.TrimRight(p, "/")
	}
	return p
}

func marshalExtra(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return ""
		}
		return string(b)
	}
}
