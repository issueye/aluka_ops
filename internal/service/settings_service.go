package service

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/pkg/guard"
	"aluka_ops/internal/repository"
)

// 面板防护 Setting 键(Setting 表持久化,内存 PanelConfig 热生效)。
const (
	SettingPanelIPWhitelist = "panel.ip_whitelist"
	SettingPanelIPBlacklist = "panel.ip_blacklist"
	SettingPanelMaxFails    = "panel.login_max_fails"
	SettingPanelWindowSec   = "panel.login_window_sec"
	SettingPanelBanSec      = "panel.login_ban_sec"
)

// PanelSettingKeys 全部面板防护键(查询/返回用)。
var PanelSettingKeys = []string{
	SettingPanelIPWhitelist,
	SettingPanelIPBlacklist,
	SettingPanelMaxFails,
	SettingPanelWindowSec,
	SettingPanelBanSec,
}

// PanelSettingsService 面板防护配置:持久化 Setting + 同步内存 PanelConfig(立即生效)。
type PanelSettingsService struct {
	repo *repository.SettingRepository
	conf *guard.PanelConfig
}

// NewPanelSettingsService 构造。
func NewPanelSettingsService(repo *repository.SettingRepository, conf *guard.PanelConfig) *PanelSettingsService {
	return &PanelSettingsService{repo: repo, conf: conf}
}

// PanelSettings 对外视图。
type PanelSettings struct {
	IPWhitelist string `json:"ip_whitelist"`
	IPBlacklist string `json:"ip_blacklist"`
	MaxFails    int    `json:"login_max_fails"`
	WindowSec   int    `json:"login_window_sec"`
	BanSec      int    `json:"login_ban_sec"`
}

// Get 返回当前生效配置:DB 值优先,未落库的键回退内存(env 启动兜底)。
func (s *PanelSettingsService) Get() (PanelSettings, error) {
	wl, bl := s.conf.Lists()
	maxFails, window, ban := s.conf.Values()
	out := PanelSettings{
		IPWhitelist: wl,
		IPBlacklist: bl,
		MaxFails:    maxFails,
		WindowSec:   int(window.Seconds()),
		BanSec:      int(ban.Seconds()),
	}
	kv := s.repo.GetMany(PanelSettingKeys)
	if v, ok := kv[SettingPanelIPWhitelist]; ok {
		out.IPWhitelist = v
	}
	if v, ok := kv[SettingPanelIPBlacklist]; ok {
		out.IPBlacklist = v
	}
	if v, ok := kv[SettingPanelMaxFails]; ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			out.MaxFails = n
		}
	}
	if v, ok := kv[SettingPanelWindowSec]; ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			out.WindowSec = n
		}
	}
	if v, ok := kv[SettingPanelBanSec]; ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			out.BanSec = n
		}
	}
	return out, nil
}

// PanelSettingsUpdate 更新输入(指针字段部分更新)。
type PanelSettingsUpdate struct {
	IPWhitelist *string `json:"ip_whitelist"`
	IPBlacklist *string `json:"ip_blacklist"`
	MaxFails    *int    `json:"login_max_fails"`
	WindowSec   *int    `json:"login_window_sec"`
	BanSec      *int    `json:"login_ban_sec"`
}

// Update 合并当前值 → 校验 → 持久化 → 热更新内存。
// 调用方(controller)需先做防自锁校验:新白名单非空时必须包含当前访问 IP。
func (s *PanelSettingsService) Update(in PanelSettingsUpdate) (PanelSettings, error) {
	wl, bl := s.conf.Lists()
	maxFails, window, ban := s.conf.Values()
	if in.IPWhitelist != nil {
		wl = strings.TrimSpace(*in.IPWhitelist)
	}
	if in.IPBlacklist != nil {
		bl = strings.TrimSpace(*in.IPBlacklist)
	}
	if in.MaxFails != nil {
		maxFails = *in.MaxFails
	}
	if in.WindowSec != nil {
		window = time.Duration(*in.WindowSec) * time.Second
	}
	if in.BanSec != nil {
		ban = time.Duration(*in.BanSec) * time.Second
	}

	// 校验:IP 名单可解析,数值在合理范围。失败不动任何状态。
	// 先于持久化执行,保证"要么全部成功,要么全部不生效"。
	if _, err := gateway.NewIPFilter(wl, bl); err != nil {
		return PanelSettings{}, fmt.Errorf("%w: %v", ErrPanelInvalid, err)
	}
	if maxFails < 1 || maxFails > 1000 {
		return PanelSettings{}, fmt.Errorf("%w: login_max_fails 须在 1-1000 之间", ErrPanelInvalid)
	}
	if window < 60 || window > 7*24*time.Hour {
		return PanelSettings{}, fmt.Errorf("%w: login_window_sec 须在 60-604800 之间", ErrPanelInvalid)
	}
	if ban < 60 || ban > 7*24*time.Hour {
		return PanelSettings{}, fmt.Errorf("%w: login_ban_sec 须在 60-604800 之间", ErrPanelInvalid)
	}

	// 持久化(仅落传入字段,未传入的保持 DB 现有值)
	kv := map[string]string{}
	if in.IPWhitelist != nil {
		kv[SettingPanelIPWhitelist] = wl
	}
	if in.IPBlacklist != nil {
		kv[SettingPanelIPBlacklist] = bl
	}
	if in.MaxFails != nil {
		kv[SettingPanelMaxFails] = strconv.Itoa(maxFails)
	}
	if in.WindowSec != nil {
		kv[SettingPanelWindowSec] = strconv.Itoa(int(window.Seconds()))
	}
	if in.BanSec != nil {
		kv[SettingPanelBanSec] = strconv.Itoa(int(ban.Seconds()))
	}
	if err := s.repo.SetMany(kv); err != nil {
		return PanelSettings{}, err
	}
	if err := s.conf.Apply(wl, bl, maxFails, window, ban); err != nil {
		// 上面已校验,理论上不会发生;发生则保持内存不变
		return PanelSettings{}, fmt.Errorf("%w: %v", ErrPanelInvalid, err)
	}
	return PanelSettings{
		IPWhitelist: wl,
		IPBlacklist: bl,
		MaxFails:    maxFails,
		WindowSec:   int(window.Seconds()),
		BanSec:      int(ban.Seconds()),
	}, nil
}