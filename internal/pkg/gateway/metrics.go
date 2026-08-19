// 拦截统计:按 端口×IP×原因 记录被网关拒绝/限流的请求。
//
// 状态独立于配置快照(ApplyPorts 热替换不清零),仅当端口关闭或手动 reset 时清除。
// 计数集合有界:单端口 IP 上限、条目超过 24h 惰性清理,防内存膨胀。
package gateway

import (
	"net"
	"sort"
	"sync"
	"time"
)

// BlockReason 拦截原因。
type BlockReason string

const (
	BlockReasonSiteACL    BlockReason = "acl_site"    // 站点级 IP 名单拒绝
	BlockReasonRuleACL    BlockReason = "acl_rule"    // 反代规则级 IP 名单拒绝
	BlockReasonRateLimit  BlockReason = "rate_limit"  // 站点级限流(429)
	BlockReasonScriptDeny BlockReason = "script_deny" // 路由脚本 deny(403)
)

const (
	blockStatsMaxIPPerPort = 10000            // 单端口最多统计的 IP 数
	blockStatsEntryTTL     = 24 * time.Hour   // 条目超过该时长无更新即清除
)

type blockEntry struct {
	Count403   int
	Count429   int
	LastReason BlockReason
	FirstSeen  time.Time
	LastSeen   time.Time
}

// BlockEntryView 拦截统计对外视图。
type BlockEntryView struct {
	Port       int         `json:"port,omitempty"`
	IP         string      `json:"ip"`
	Count403   int         `json:"count403"`
	Count429   int         `json:"count429"`
	LastReason BlockReason `json:"last_reason"`
	FirstSeen  time.Time   `json:"first_seen"`
	LastSeen   time.Time   `json:"last_seen"`
}

// BlockStats 端口×IP 拦截计数。
type BlockStats struct {
	mu   sync.Mutex
	data map[int]map[string]*blockEntry // port -> ip -> entry
}

// NewBlockStats 构造。
func NewBlockStats() *BlockStats {
	return &BlockStats{data: map[int]map[string]*blockEntry{}}
}

// Record 记录一次拦截(限流原因计入 429,其余计入 403)。
func (s *BlockStats) Record(port int, ip net.IP, reason BlockReason) {
	if s == nil || ip == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	byIP := s.data[port]
	if byIP == nil {
		byIP = make(map[string]*blockEntry)
		s.data[port] = byIP
	}
	// 惰性清理过期条目
	for k, e := range byIP {
		if now.Sub(e.LastSeen) > blockStatsEntryTTL {
			delete(byIP, k)
		}
	}
	if len(byIP) >= blockStatsMaxIPPerPort {
		s.evictOldestLocked(byIP)
	}
	key := ip.String()
	e := byIP[key]
	if e == nil {
		e = &blockEntry{FirstSeen: now}
		byIP[key] = e
	}
	e.LastSeen = now
	e.LastReason = reason
	if reason == BlockReasonRateLimit {
		e.Count429++
	} else {
		e.Count403++
	}
}

func (s *BlockStats) evictOldestLocked(byIP map[string]*blockEntry) {
	var oldestKey string
	var oldest time.Time
	for k, e := range byIP {
		if oldestKey == "" || e.LastSeen.Before(oldest) {
			oldestKey, oldest = k, e.LastSeen
		}
	}
	if oldestKey != "" {
		delete(byIP, oldestKey)
	}
}

// Snapshot 返回指定端口的统计(按最近时间倒序)。
func (s *BlockStats) Snapshot(port int) []BlockEntryView {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.viewsLocked(port, false)
}

// SnapshotAll 返回全端口统计(每条含 port,按端口升序)。
func (s *BlockStats) SnapshotAll() []BlockEntryView {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []BlockEntryView
	ports := make([]int, 0, len(s.data))
	for p := range s.data {
		ports = append(ports, p)
	}
	sort.Ints(ports)
	for _, p := range ports {
		out = append(out, s.viewsLocked(p, true)...)
	}
	return out
}

func (s *BlockStats) viewsLocked(port int, withPort bool) []BlockEntryView {
	byIP := s.data[port]
	out := make([]BlockEntryView, 0, len(byIP))
	for ip, e := range byIP {
		v := BlockEntryView{
			IP:         ip,
			Count403:   e.Count403,
			Count429:   e.Count429,
			LastReason: e.LastReason,
			FirstSeen:  e.FirstSeen,
			LastSeen:   e.LastSeen,
		}
		if withPort {
			v.Port = port
		}
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen.After(out[j].LastSeen) })
	return out
}

// Reset 清零统计;port<=0 表示全部清空。
func (s *BlockStats) Reset(port int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if port <= 0 {
		s.data = map[int]map[string]*blockEntry{}
		return
	}
	delete(s.data, port)
}