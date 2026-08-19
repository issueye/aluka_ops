// Package guard 面板自防护:面板访问 IP 名单 + 登录防爆破(fail2ban 风格)。
//
// 全部状态在内存:封禁/失败计数重启即清零(防误封自愈,有意取舍)。
// 配置优先级:Setting(运行期热更新) > 环境变量(启动兜底) > 默认值。
package guard

import (
	"sort"
	"strings"
	"sync"
	"time"

	"aluka_ops/internal/pkg/gateway"
)

// PanelConfig 面板防护配置快照。
type PanelConfig struct {
	mu        sync.RWMutex
	whitelist string
	blacklist string
	filter    *gateway.IPFilter // 由 whitelist/blacklist 编译,Apply 时重建
	maxFails  int
	window    time.Duration
	ban       time.Duration
}

// NewPanelConfig 构造(启动时以环境变量/默认值为初始值)。
func NewPanelConfig(whitelist, blacklist string, maxFails int, window, ban time.Duration) *PanelConfig {
	c := &PanelConfig{}
	_ = c.Apply(whitelist, blacklist, maxFails, window, ban)
	return c
}

// Apply 校验并整体更新配置;IP 名单解析失败时返回错误且不改动原值。
// 非法数值按默认值兜底(maxFails=5, window=10m, ban=15m)。
func (c *PanelConfig) Apply(whitelist, blacklist string, maxFails int, window, ban time.Duration) error {
	f, err := gateway.NewIPFilter(whitelist, blacklist)
	if err != nil {
		return err
	}
	if maxFails <= 0 {
		maxFails = 5
	}
	if window <= 0 {
		window = 10 * time.Minute
	}
	if ban <= 0 {
		ban = 15 * time.Minute
	}
	c.mu.Lock()
	c.whitelist = whitelist
	c.blacklist = blacklist
	c.filter = f
	c.maxFails = maxFails
	c.window = window
	c.ban = ban
	c.mu.Unlock()
	return nil
}

// Filter 当前编译好的 IP 名单判定器(不变对象,可并发读)。
func (c *PanelConfig) Filter() *gateway.IPFilter {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.filter
}

// Lists 当前名单原文。
func (c *PanelConfig) Lists() (whitelist, blacklist string) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.whitelist, c.blacklist
}

// Values 当前防护参数(失败阈值/窗口/封禁时长)。
func (c *PanelConfig) Values() (maxFails int, window, ban time.Duration) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.maxFails, c.window, c.ban
}

// ===== Guard:登录失败计数 + 临时封禁 =====

const (
	guardMaxFails = 10000 // 失败计数 IP 上限
	guardMaxBans  = 1000  // 封禁 IP 上限
)

// Guard 登录防爆破状态(fail2ban 风格)。
// 单 IP 在窗口内失败达阈值 → 封禁该 IP 对全部 /api 的访问(由 ipguard 中间件执行)。
type Guard struct {
	conf  *PanelConfig
	mu    sync.Mutex
	fails map[string]*failState // ip -> 窗口内失败状态
	bans  map[string]time.Time  // ip -> 封禁截止时间
	nowFn func() time.Time
}

type failState struct {
	count       int
	windowStart time.Time
}

// BanInfo 封禁视图。
type BanInfo struct {
	IP       string    `json:"ip"`
	BanUntil time.Time `json:"ban_until"`
}

// FailInfo 失败计数视图。
type FailInfo struct {
	IP          string    `json:"ip"`
	Count       int       `json:"count"`
	WindowStart time.Time `json:"window_start"`
}

// NewGuard 构造。
func NewGuard(conf *PanelConfig) *Guard {
	if conf == nil {
		conf = NewPanelConfig("", "", 5, 10*time.Minute, 15*time.Minute)
	}
	return &Guard{
		conf:  conf,
		fails: map[string]*failState{},
		bans:  map[string]time.Time{},
		nowFn: time.Now,
	}
}

// RecordFailure 记录一次登录失败。
// 若因此触发封禁,返回 true 与封禁时长(否则 false)。
func (g *Guard) RecordFailure(ip string) (banned bool, banFor time.Duration) {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return false, 0
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.nowFn()
	g.cleanupLocked(now)
	if b, ok := g.bans[ip]; ok && now.Before(b) {
		return true, b.Sub(now)
	}
	maxFails, window, ban := g.conf.Values()
	fs, ok := g.fails[ip]
	if !ok {
		fs = &failState{count: 1, windowStart: now}
		g.fails[ip] = fs
	} else if now.Sub(fs.windowStart) > window {
		fs.count = 1
		fs.windowStart = now
	} else {
		fs.count++
	}
	if fs.count >= maxFails {
		if len(g.bans) >= guardMaxBans {
			g.evictOldestBanLocked(now)
		}
		g.bans[ip] = now.Add(ban)
		delete(g.fails, ip)
		return true, ban
	}
	return false, 0
}

// RecordSuccess 登录成功,清除该 IP 的失败计数与封禁。
func (g *Guard) RecordSuccess(ip string) {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.fails, ip)
	delete(g.bans, ip)
}

// IsBanned 是否处于封禁期;是则返回剩余时长(顺带清理过期封禁)。
func (g *Guard) IsBanned(ip string) (banned bool, retryAfter time.Duration) {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return false, 0
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.nowFn()
	if b, ok := g.bans[ip]; ok {
		if now.Before(b) {
			return true, b.Sub(now)
		}
		delete(g.bans, ip)
	}
	return false, 0
}

// Unban 人工解封;存在封禁时清除并返回 true。
func (g *Guard) Unban(ip string) bool {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return false
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	_, ok := g.bans[ip]
	delete(g.bans, ip)
	delete(g.fails, ip)
	return ok
}

// Bans 当前封禁列表(按到期时间升序)。
func (g *Guard) Bans() []BanInfo {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.nowFn()
	g.cleanupLocked(now)
	out := make([]BanInfo, 0, len(g.bans))
	for ip, until := range g.bans {
		if now.Before(until) {
			out = append(out, BanInfo{IP: ip, BanUntil: until})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].BanUntil.Before(out[j].BanUntil) })
	return out
}

// Failures 当前失败计数列表(按窗口开始时间降序)。
func (g *Guard) Failures() []FailInfo {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]FailInfo, 0, len(g.fails))
	for ip, fs := range g.fails {
		out = append(out, FailInfo{IP: ip, Count: fs.count, WindowStart: fs.windowStart})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].WindowStart.After(out[j].WindowStart) })
	return out
}

func (g *Guard) cleanupLocked(now time.Time) {
	for ip, until := range g.bans {
		if !now.Before(until) {
			delete(g.bans, ip)
		}
	}
	_, window, _ := g.conf.Values()
	for ip, fs := range g.fails {
		if now.Sub(fs.windowStart) > window {
			delete(g.fails, ip)
		}
	}
	if len(g.fails) > guardMaxFails {
		// 超出上限:按最早开始时间淘汰
		var oldestIP string
		var oldest time.Time
		for ip, fs := range g.fails {
			if oldestIP == "" || fs.windowStart.Before(oldest) {
				oldestIP, oldest = ip, fs.windowStart
			}
		}
		if oldestIP != "" {
			delete(g.fails, oldestIP)
		}
	}
}

func (g *Guard) evictOldestBanLocked(now time.Time) {
	var oldestIP string
	var oldest time.Time
	for ip, until := range g.bans {
		if oldestIP == "" || until.Before(oldest) {
			oldestIP, oldest = ip, until
		}
	}
	if oldestIP != "" {
		delete(g.bans, oldestIP)
	}
}