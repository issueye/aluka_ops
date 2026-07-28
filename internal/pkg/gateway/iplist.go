package gateway

import (
	"fmt"
	"net"
	"net/http"
	"strings"
)

// IPFilter 站点级 IP 访问控制。
// 规则:
//  1. 命中黑名单 → 拒绝
//  2. 白名单非空且未命中 → 拒绝
//  3. 否则放行
//
// 列表项支持单 IP 或 CIDR(如 10.0.0.0/8、192.168.1.1)。
type IPFilter struct {
	Whitelist []*net.IPNet
	Blacklist []*net.IPNet
}

// ParseIPList 解析换行/逗号/分号分隔的 IP 列表。
func ParseIPList(raw string) ([]*net.IPNet, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	// 统一分隔
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, ";", "\n")
	raw = strings.ReplaceAll(raw, ",", "\n")
	var out []*net.IPNet
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		n, err := parseIPOrCIDR(line)
		if err != nil {
			return nil, fmt.Errorf("无效 IP/CIDR %q: %w", line, err)
		}
		out = append(out, n)
	}
	return out, nil
}

func parseIPOrCIDR(s string) (*net.IPNet, error) {
	if strings.Contains(s, "/") {
		_, n, err := net.ParseCIDR(s)
		return n, err
	}
	ip := net.ParseIP(s)
	if ip == nil {
		return nil, fmt.Errorf("无法解析")
	}
	if v4 := ip.To4(); v4 != nil {
		return &net.IPNet{IP: v4, Mask: net.CIDRMask(32, 32)}, nil
	}
	return &net.IPNet{IP: ip, Mask: net.CIDRMask(128, 128)}, nil
}

// Match 是否命中列表。
func MatchIPList(list []*net.IPNet, ip net.IP) bool {
	if ip == nil || len(list) == 0 {
		return false
	}
	for _, n := range list {
		if n != nil && n.Contains(ip) {
			return true
		}
	}
	return false
}

// Allowed 综合黑白名单判定。
func (f *IPFilter) Allowed(ip net.IP) bool {
	if f == nil {
		return true
	}
	if MatchIPList(f.Blacklist, ip) {
		return false
	}
	if len(f.Whitelist) > 0 && !MatchIPList(f.Whitelist, ip) {
		return false
	}
	return true
}

// ClientIP 从请求提取客户端 IP。
// 未配置可信代理时只使用 TCP 对端;只有 immediate peer 可信时才解析转发头。
func ClientIP(r *http.Request, trusted ...[]*net.IPNet) net.IP {
	if r == nil {
		return nil
	}
	peer := remoteIP(r.RemoteAddr)
	var proxies []*net.IPNet
	if len(trusted) > 0 {
		proxies = trusted[0]
	}
	if !MatchIPList(proxies, peer) {
		return peer
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			ip := net.ParseIP(strings.TrimSpace(parts[i]))
			if ip != nil && !MatchIPList(proxies, ip) {
				return ip
			}
		}
	}
	if xri := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); xri != nil {
		return xri
	}
	return peer
}

func remoteIP(remoteAddr string) net.IP {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return net.ParseIP(strings.TrimSpace(remoteAddr))
	}
	return net.ParseIP(host)
}

// NewIPFilter 从原始字符串构建。
func NewIPFilter(whitelist, blacklist string) (*IPFilter, error) {
	wl, err := ParseIPList(whitelist)
	if err != nil {
		return nil, fmt.Errorf("白名单: %w", err)
	}
	bl, err := ParseIPList(blacklist)
	if err != nil {
		return nil, fmt.Errorf("黑名单: %w", err)
	}
	return &IPFilter{Whitelist: wl, Blacklist: bl}, nil
}
