// Package gateway 动态端口网关:静态站 + 反向代理。
//
// 设计要点:
//   - 按 listen_port 聚合规则,动态 Listen / 关闭
//   - 同端口内按 path_prefix 最长匹配
//   - 反代流式转发,不整包缓冲,利于大文件上传
package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"aluka_ops/internal/model"
)

// Rule 运行时规则快照(与 DB 解耦)。
type Rule struct {
	ID                       uint
	Code                     string
	Name                     string
	Type                     model.GatewayRuleType
	ListenPort               int
	PathPrefix               string
	StripPrefix              bool
	RootDir                  string
	SPAFallback              bool
	Upstream                 string
	ConnectTimeoutSec        int
	ResponseHeaderTimeoutSec int
	IOTimeoutSec             int
	MaxBodyBytes             int64
	PassHost                 bool
	ExtraHeaders             map[string]string
	EnableWebSocket          bool
	Sort                     int
}

// PortConfig 单个监听端口的运行时配置。
type PortConfig struct {
	Port    int
	Rules   []Rule
	Scripts []CompiledScript
	// IP 过滤(可空)
	IPFilter *IPFilter
}

// Manager 管理多端口 HTTP 服务。
type Manager struct {
	mu             sync.RWMutex
	ports          map[int]*portServer // port -> server
	dataDir        string              // data 根目录
	onChange       func()              // 可选回调
	trustedProxies []*net.IPNet
}

type portServer struct {
	port     int
	server   *http.Server
	listener net.Listener
	// rules / scripts / ip 快照
	rules          []Rule
	scripts        []CompiledScript
	ipFilter       *IPFilter
	trustedProxies []*net.IPNet
	cancel         context.CancelFunc
}

// NewManager 构造。
func NewManager(dataDir string) *Manager {
	return &Manager{
		ports:   make(map[int]*portServer),
		dataDir: dataDir,
	}
}

// SetTrustedProxies 设置可信反向代理列表。
func (m *Manager) SetTrustedProxies(raw string) error {
	list, err := ParseIPList(raw)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.trustedProxies = list
	m.mu.Unlock()
	return nil
}

// DataDir 返回数据根目录(脚本 static 相对路径解析用)。
func (m *Manager) DataDir() string { return m.dataDir }

// Apply 用完整启用规则列表重建端口监听(无脚本)。
func (m *Manager) Apply(enabled []model.GatewayRule) error {
	return m.ApplyPorts(RulesToPortConfigs(enabled, m.dataDir))
}

// RulesToPortConfigs 将扁平规则按端口分组。
func RulesToPortConfigs(enabled []model.GatewayRule, dataDir string) []PortConfig {
	byPort := map[int][]Rule{}
	for _, r := range enabled {
		if r.ListenPort <= 0 || r.ListenPort > 65535 {
			continue
		}
		rule, err := toRuntime(r, dataDir)
		if err != nil {
			log.Printf("[gateway] skip rule %s: %v", r.Code, err)
			continue
		}
		byPort[rule.ListenPort] = append(byPort[rule.ListenPort], rule)
	}
	out := make([]PortConfig, 0, len(byPort))
	for port, rules := range byPort {
		sortRules(rules)
		out = append(out, PortConfig{Port: port, Rules: rules})
	}
	return out
}

// ApplyPorts 按端口配置重建监听(含路由脚本)。
func (m *Manager) ApplyPorts(cfgs []PortConfig) error {
	byPort := map[int]PortConfig{}
	for _, c := range cfgs {
		if c.Port <= 0 || c.Port > 65535 {
			continue
		}
		rules := append([]Rule(nil), c.Rules...)
		sortRules(rules)
		scripts := append([]CompiledScript(nil), c.Scripts...)
		sort.SliceStable(scripts, func(i, j int) bool {
			if scripts[i].Priority != scripts[j].Priority {
				return scripts[i].Priority < scripts[j].Priority
			}
			return scripts[i].ID < scripts[j].ID
		})
		// 仅脚本无 rules 也要监听
		if len(rules) == 0 && len(scripts) == 0 {
			continue
		}
		byPort[c.Port] = PortConfig{
			Port:     c.Port,
			Rules:    rules,
			Scripts:  scripts,
			IPFilter: c.IPFilter,
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for port, ps := range m.ports {
		if _, ok := byPort[port]; !ok {
			m.stopPortLocked(ps)
			delete(m.ports, port)
			log.Printf("[gateway] stop listen :%d", port)
		}
	}

	var firstErr error
	for port, cfg := range byPort {
		if ps, ok := m.ports[port]; ok {
			ps.rules = cfg.Rules
			ps.scripts = cfg.Scripts
			ps.ipFilter = cfg.IPFilter
			ps.trustedProxies = append([]*net.IPNet(nil), m.trustedProxies...)
			continue
		}
		ps, err := m.startPortLocked(port, cfg.Rules, cfg.Scripts, cfg.IPFilter)
		if err != nil {
			log.Printf("[gateway] listen :%d failed: %v", port, err)
			if firstErr == nil {
				firstErr = fmt.Errorf("端口 %d: %w", port, err)
			}
			continue
		}
		ps.trustedProxies = append([]*net.IPNet(nil), m.trustedProxies...)
		m.ports[port] = ps

		log.Printf("[gateway] listen :%d rules=%d scripts=%d", port, len(cfg.Rules), len(cfg.Scripts))
	}
	return firstErr
}

// Status 当前监听端口与规则数。
func (m *Manager) Status() []map[string]any {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]map[string]any, 0, len(m.ports))
	for port, ps := range m.ports {
		codes := make([]string, 0, len(ps.rules)+len(ps.scripts))
		for _, r := range ps.rules {
			codes = append(codes, r.Code)
		}
		for _, s := range ps.scripts {
			codes = append(codes, "sc_"+s.Code)
		}
		out = append(out, map[string]any{
			"port":         port,
			"rule_count":   len(ps.rules),
			"script_count": len(ps.scripts),
			"rules":        codes,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i]["port"].(int) < out[j]["port"].(int)
	})
	return out
}

// Close 关闭全部端口。
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for p, ps := range m.ports {
		m.stopPortLocked(ps)
		delete(m.ports, p)
	}
}

func (m *Manager) stopPortLocked(ps *portServer) {
	if ps.cancel != nil {
		ps.cancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if ps.server != nil {
		_ = ps.server.Shutdown(ctx)
	}
	if ps.listener != nil {
		_ = ps.listener.Close()
	}
}

func (m *Manager) startPortLocked(port int, rules []Rule, scripts []CompiledScript, ipf *IPFilter) (*portServer, error) {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	ps := &portServer{
		port:     port,
		listener: ln,
		rules:    rules,
		scripts:  scripts,
		ipFilter: ipf,
		cancel:   cancel,
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.serve(ps, w, r)
	})
	ps.server = &http.Server{
		Handler: handler,
		// 网关层不设过短的 Read/WriteTimeout,避免大上传被切断;
		// 具体超时由反代 Transport / 单规则 IOTimeout 控制。
		ReadHeaderTimeout: 30 * time.Second,
		// IdleTimeout 仅连接空闲
		IdleTimeout: 120 * time.Second,
		// 不设 ReadTimeout/WriteTimeout → 允许长时间流式上传/下载
		MaxHeaderBytes: 1 << 20,
	}
	go func() {
		err := ps.server.Serve(ln)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[gateway] serve :%d exit: %v", port, err)
		}
		cancel()
		_ = ctx
	}()
	return ps, nil
}

func (m *Manager) serve(ps *portServer, w http.ResponseWriter, r *http.Request) {
	m.mu.RLock()
	rules := ps.rules
	scripts := ps.scripts
	ipf := ps.ipFilter
	trustedProxies := ps.trustedProxies
	m.mu.RUnlock()

	// IP 黑白名单(站点级)
	if ipf != nil {
		cip := ClientIP(r, trustedProxies)
		if !ipf.Allowed(cip) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			http.Error(w, "403 forbidden: ip not allowed", http.StatusForbidden)
			return
		}
	}

	path := r.URL.Path
	if path == "" {
		path = "/"
	}

	// 1) 路由脚本优先
	if len(scripts) > 0 {
		act := RunScripts(scripts, r, path)
		path = act.Path
		if path == "" {
			path = "/"
		}
		// 将改写后的 path 写回请求,供后续规则使用
		r2 := r.Clone(r.Context())
		r2.URL = cloneURL(r.URL)
		r2.URL.Path = path
		switch act.Kind {
		case "deny":
			for k, v := range act.Headers {
				w.Header().Set(k, v)
			}
			st := act.Status
			if st <= 0 {
				st = http.StatusForbidden
			}
			w.WriteHeader(st)
			if act.Body != "" {
				_, _ = w.Write([]byte(act.Body))
			} else {
				_, _ = w.Write([]byte(http.StatusText(st)))
			}
			return
		case "redirect":
			for k, v := range act.Headers {
				w.Header().Set(k, v)
			}
			http.Redirect(w, r2, act.Location, act.Status)
			return
		case "proxy":
			rule := Rule{
				Type:                     model.GatewayTypeProxy,
				PathPrefix:               "/",
				StripPrefix:              act.StripPrefix != "",
				Upstream:                 act.ProxyURL,
				ConnectTimeoutSec:        10,
				ResponseHeaderTimeoutSec: 60,
				IOTimeoutSec:             0,
				MaxBodyBytes:             0,
				EnableWebSocket:          true,
				ExtraHeaders:             act.Headers,
			}
			// strip_prefix 为具体前缀字符串时,临时改 path
			if act.StripPrefix != "" {
				rule.PathPrefix = normalizePrefix(act.StripPrefix)
				rule.StripPrefix = true
			}
			serveProxy(w, r2, rule, trustedProxies)
			return
		case "static":
			root := act.StaticRoot
			if !filepath.IsAbs(root) {
				root = filepath.Join(m.dataDir, root)
			}
			abs, err := filepath.Abs(root)
			if err != nil {
				http.Error(w, "static root invalid", http.StatusBadGateway)
				return
			}
			serveStatic(w, r2, Rule{
				Type:        model.GatewayTypeStatic,
				PathPrefix:  "/",
				StripPrefix: false,
				RootDir:     abs,
				SPAFallback: act.SPA,
			})
			return
		case "break", "none":
			r = r2 // 使用可能被 rewrite 的 path 继续匹配 APP/反代
		default:
			r = r2
		}
		path = r.URL.Path
	}

	rule := matchRule(rules, path)
	if rule == nil {
		http.Error(w, "no gateway rule matched", http.StatusNotFound)
		return
	}
	switch rule.Type {
	case model.GatewayTypeStatic:
		serveStatic(w, r, *rule)
	case model.GatewayTypeProxy:
		serveProxy(w, r, *rule, trustedProxies)
	default:
		http.Error(w, "unknown rule type", http.StatusInternalServerError)
	}
}

func cloneURL(u *url.URL) *url.URL {
	if u == nil {
		return &url.URL{Path: "/"}
	}
	cp := *u
	return &cp
}

func matchRule(rules []Rule, path string) *Rule {
	// rules 已按前缀长度降序
	for i := range rules {
		p := normalizePrefix(rules[i].PathPrefix)
		if p == "/" {
			return &rules[i]
		}
		if path == p || strings.HasPrefix(path, p+"/") {
			return &rules[i]
		}
	}
	return nil
}

func normalizePrefix(p string) string {
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

func sortRules(rules []Rule) {
	sort.SliceStable(rules, func(i, j int) bool {
		li, lj := len(normalizePrefix(rules[i].PathPrefix)), len(normalizePrefix(rules[j].PathPrefix))
		if li != lj {
			return li > lj // 最长前缀优先
		}
		if rules[i].Sort != rules[j].Sort {
			return rules[i].Sort < rules[j].Sort
		}
		return rules[i].ID < rules[j].ID
	})
}

func toRuntime(r model.GatewayRule, dataDir string) (Rule, error) {
	prefix := normalizePrefix(r.PathPrefix)
	out := Rule{
		ID:                       r.ID,
		Code:                     r.Code,
		Name:                     r.Name,
		Type:                     r.Type,
		ListenPort:               r.ListenPort,
		PathPrefix:               prefix,
		StripPrefix:              r.StripPrefix,
		SPAFallback:              r.SPAFallback,
		Upstream:                 strings.TrimSpace(r.Upstream),
		ConnectTimeoutSec:        r.ConnectTimeoutSec,
		ResponseHeaderTimeoutSec: r.ResponseHeaderTimeoutSec,
		IOTimeoutSec:             r.IOTimeoutSec,
		MaxBodyBytes:             r.MaxBodyBytes,
		PassHost:                 r.PassHost,
		EnableWebSocket:          r.EnableWebSocket,
		Sort:                     r.Sort,
	}
	if r.ExtraHeaders != "" {
		_ = json.Unmarshal([]byte(r.ExtraHeaders), &out.ExtraHeaders)
	}
	if out.ExtraHeaders == nil {
		out.ExtraHeaders = map[string]string{}
	}
	switch r.Type {
	case model.GatewayTypeStatic:
		root := strings.TrimSpace(r.RootDir)
		if root == "" {
			return out, errors.New("static root_dir 为空")
		}
		if !filepath.IsAbs(root) {
			root = filepath.Join(dataDir, root)
		}
		abs, err := filepath.Abs(root)
		if err != nil {
			return out, err
		}
		out.RootDir = abs
	case model.GatewayTypeProxy:
		if out.Upstream == "" {
			return out, errors.New("proxy upstream 为空")
		}
		if _, err := url.Parse(out.Upstream); err != nil {
			return out, fmt.Errorf("upstream 无效: %w", err)
		}
	default:
		return out, fmt.Errorf("未知类型 %s", r.Type)
	}
	return out, nil
}

// ===== static =====

func serveStatic(w http.ResponseWriter, r *http.Request, rule Rule) {
	reqPath := r.URL.Path
	prefix := normalizePrefix(rule.PathPrefix)
	rel := reqPath
	if rule.StripPrefix && prefix != "/" {
		rel = strings.TrimPrefix(reqPath, prefix)
	}
	rel = strings.TrimPrefix(rel, "/")
	// 防穿越
	clean := filepath.Clean("/" + rel)
	clean = strings.TrimPrefix(clean, "/")
	if strings.HasPrefix(clean, "..") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	full := filepath.Join(rule.RootDir, filepath.FromSlash(clean))
	// 确保仍在 root 下
	root := rule.RootDir
	if !isUnder(root, full) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	fi, err := os.Stat(full)
	if err == nil && fi.IsDir() {
		idx := filepath.Join(full, "index.html")
		if _, err := os.Stat(idx); err == nil {
			http.ServeFile(w, r, idx)
			return
		}
		if rule.SPAFallback {
			spa := filepath.Join(rule.RootDir, "index.html")
			if _, err := os.Stat(spa); err == nil {
				http.ServeFile(w, r, spa)
				return
			}
		}
		http.NotFound(w, r)
		return
	}
	if err == nil && !fi.IsDir() {
		http.ServeFile(w, r, full)
		return
	}
	// 文件不存在:SPA fallback
	if rule.SPAFallback {
		spa := filepath.Join(rule.RootDir, "index.html")
		if _, err := os.Stat(spa); err == nil {
			http.ServeFile(w, r, spa)
			return
		}
	}
	http.NotFound(w, r)
}

func isUnder(root, abs string) bool {
	root = filepath.Clean(root)
	abs = filepath.Clean(abs)
	if root == abs {
		return true
	}
	sep := string(os.PathSeparator)
	if !strings.HasSuffix(root, sep) {
		root += sep
	}
	return strings.HasPrefix(strings.ToLower(abs), strings.ToLower(root))
}

// ===== reverse proxy (upload-friendly streaming) =====

func serveProxy(w http.ResponseWriter, r *http.Request, rule Rule, trustedProxies []*net.IPNet) {
	target, err := url.Parse(rule.Upstream)
	if err != nil || target.Scheme == "" || target.Host == "" {
		http.Error(w, "invalid upstream", http.StatusBadGateway)
		return
	}

	// 可选限制 body;0=不限制。大文件上传务必 MaxBodyBytes=0。
	if rule.MaxBodyBytes > 0 && r.Body != nil {
		r.Body = http.MaxBytesReader(w, r.Body, rule.MaxBodyBytes)
	}

	connectTO := durationSec(rule.ConnectTimeoutSec, 10)
	headerTO := durationSec(rule.ResponseHeaderTimeoutSec, 60)
	// 注意:Transport 不设整体 Response 超时,以便流式上传/下载长时间传输。
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   connectTO,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: headerTO,
		// 禁用压缩自动处理,原样转发
		DisableCompression: true,
		// 大 body:默认即可流式,不缓冲整个请求
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.Transport = transport
	// 自定义 Director:路径改写 + Header
	origDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		origDirector(req)
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		// 路径
		prefix := normalizePrefix(rule.PathPrefix)
		p := req.URL.Path
		if rule.StripPrefix && prefix != "/" {
			p = strings.TrimPrefix(p, prefix)
			if p == "" {
				p = "/"
			}
		}
		// 拼上游 path
		basePath := strings.TrimRight(target.Path, "/")
		if basePath == "" {
			req.URL.Path = singleJoiningSlash("", p)
		} else {
			req.URL.Path = singleJoiningSlash(basePath, p)
		}
		if target.RawQuery == "" || req.URL.RawQuery == "" {
			req.URL.RawQuery = target.RawQuery + req.URL.RawQuery
		} else {
			req.URL.RawQuery = target.RawQuery + "&" + req.URL.RawQuery
		}

		if !rule.PassHost {
			req.Host = target.Host
		}
		// 反代头由网关统一生成,不信任客户端传入值。
		req.Header.Del("X-Forwarded-For")
		req.Header.Del("X-Real-IP")
		req.Header.Del("X-Forwarded-Proto")
		req.Header.Set("X-Forwarded-Host", req.Host)
		if req.TLS != nil {
			req.Header.Set("X-Forwarded-Proto", "https")
		} else {
			req.Header.Set("X-Forwarded-Proto", "http")
		}
		if clientIP := ClientIP(req, trustedProxies); clientIP != nil {

			req.Header.Set("X-Real-IP", clientIP.String())
			req.Header.Set("X-Forwarded-For", clientIP.String())
		}
		for k, v := range rule.ExtraHeaders {
			if isForwardedHeader(k) {
				continue
			}
			if v == "" {
				req.Header.Del(k)
			} else {
				req.Header.Set(k, v)
			}
		}

		// 删除可能干扰 hop-by-hop 的头由 ReverseProxy 处理
	}

	proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, e error) {
		log.Printf("[gateway] proxy %s %s → %s error: %v", req.Method, req.URL.Path, rule.Upstream, e)
		// 客户端取消上传时不报 502 吓人
		if errors.Is(e, context.Canceled) || errors.Is(e, io.EOF) {
			return
		}
		rw.WriteHeader(http.StatusBadGateway)
		_, _ = rw.Write([]byte("bad gateway: " + e.Error()))
	}

	// FlushInterval 对 SSE/流式响应友好;上传主要是请求体流
	proxy.FlushInterval = 100 * time.Millisecond

	// WebSocket:标准 ReverseProxy 已支持 Hijack
	if !rule.EnableWebSocket && isWebSocket(r) {
		http.Error(w, "websocket disabled", http.StatusBadRequest)
		return
	}

	// 可选整体 deadline(仅当配置了 IOTimeout 且 >0)
	if rule.IOTimeoutSec > 0 {
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(rule.IOTimeoutSec)*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
	}

	proxy.ServeHTTP(w, r)
}

func isForwardedHeader(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "x-forwarded-for", "x-real-ip", "x-forwarded-proto", "x-forwarded-host":
		return true
	default:
		return false
	}
}

func isWebSocket(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

func durationSec(sec, def int) time.Duration {
	if sec <= 0 {
		sec = def
	}
	return time.Duration(sec) * time.Second
}

func singleJoiningSlash(a, b string) string {
	aslash := strings.HasSuffix(a, "/")
	bslash := strings.HasPrefix(b, "/")
	switch {
	case aslash && bslash:
		return a + b[1:]
	case !aslash && !bslash:
		if a == "" {
			return b
		}
		return a + "/" + b
	}
	return a + b
}
