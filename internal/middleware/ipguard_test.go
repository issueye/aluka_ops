package middleware

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/pkg/guard"
)

func newTestGuard() *guard.Guard {
	conf := guard.NewPanelConfig("10.0.0.0/8", "", 3, 10*time.Minute, 15*time.Minute)
	return guard.NewGuard(conf)
}

func setupRouter(g *guard.Guard, conf *guard.PanelConfig) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(IPGuard(conf, g, nil))
	r.GET("/api/hello", func(c *gin.Context) { c.String(200, "ok") })
	r.GET("/api/health", func(c *gin.Context) { c.String(200, "health") })
	return r
}

func doReq(r http.Handler, path, remoteAddr string, agentToken string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", path, nil)
	req.RemoteAddr = remoteAddr
	if agentToken != "" {
		req.Header.Set("X-Agent-Token", agentToken)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestIPGuardAgentBypass(t *testing.T) {
	g := newTestGuard()
	conf := guard.NewPanelConfig("10.0.0.0/8", "", 3, 10*time.Minute, 15*time.Minute)
	r := setupRouter(g, conf)
	// 白名单排除该 IP,但 agent 机器流量应放行
	w := doReq(r, "/api/hello", "192.168.1.100:1234", "")
	// 无 agent token → 白名单外应 403
	if w.Code != http.StatusForbidden {
		t.Fatalf("白名单外普通请求应 403, got %d", w.Code)
	}
	// 模拟 Auth 已设置 operator=agent
	gin.SetMode(gin.TestMode)
	r2 := gin.New()
	r2.Use(func(c *gin.Context) { c.Set("operator", "agent"); c.Next() })
	r2.Use(IPGuard(conf, g, nil))
	r2.GET("/api/hello", func(c *gin.Context) { c.String(200, "ok") })
	w2 := doReq(r2, "/api/hello", "192.168.1.100:1234", "")
	if w2.Code != http.StatusOK {
		t.Fatalf("agent 机器流量应放行, got %d", w2.Code)
	}
}

func TestIPGuardWhitelist(t *testing.T) {
	g := newTestGuard()
	conf := guard.NewPanelConfig("10.0.0.0/8", "", 3, 10*time.Minute, 15*time.Minute)
	r := setupRouter(g, conf)
	if w := doReq(r, "/api/hello", "10.1.2.3:9999", ""); w.Code != http.StatusOK {
		t.Fatalf("白名单内应放行, got %d", w.Code)
	}
	if w := doReq(r, "/api/hello", "192.168.1.5:9999", ""); w.Code != http.StatusForbidden {
		t.Fatalf("白名单外应 403, got %d", w.Code)
	}
}

func TestIPGuardBlacklist(t *testing.T) {
	g := newTestGuard()
	conf := guard.NewPanelConfig("", "10.0.0.5", 3, 10*time.Minute, 15*time.Minute)
	r := setupRouter(g, conf)
	if w := doReq(r, "/api/hello", "10.0.0.5:9999", ""); w.Code != http.StatusForbidden {
		t.Fatalf("黑名单命中应 403, got %d", w.Code)
	}
	if w := doReq(r, "/api/hello", "10.0.0.6:9999", ""); w.Code != http.StatusOK {
		t.Fatalf("黑名单外应放行, got %d", w.Code)
	}
}

func TestIPGuardBannedIP(t *testing.T) {
	g := guard.NewGuard(guard.NewPanelConfig("", "", 1, 10*time.Minute, 15*time.Minute))
	_, _ = g.RecordFailure("11.22.33.44") // 1 次即封禁
	r := setupRouter(g, guard.NewPanelConfig("", "", 1, 10*time.Minute, 15*time.Minute))
	w := doReq(r, "/api/hello", "11.22.33.44:9999", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("封禁 IP 应 403, got %d", w.Code)
	}
	// 解封后放行
	g.Unban("11.22.33.44")
	if w := doReq(r, "/api/hello", "11.22.33.44:9999", ""); w.Code != http.StatusOK {
		t.Fatalf("解封后应放行, got %d", w.Code)
	}
}

func TestIPGuardExemptPaths(t *testing.T) {
	g := newTestGuard()
	conf := guard.NewPanelConfig("10.0.0.0/8", "", 3, 10*time.Minute, 15*time.Minute)
	r := setupRouter(g, conf)
	// /api/health 豁免,白名单外也应放行
	if w := doReq(r, "/api/health", "192.168.99.1:1234", ""); w.Code != http.StatusOK {
		t.Fatalf("/api/health 应豁免, got %d", w.Code)
	}
	// 未注册的豁免路径(心跳/隧道)也直接放行
	if w := doReq(r, "/api/agents/heartbeat", "192.168.99.1:1234", ""); w.Code != 404 {
		// 路由未注册会 404,关键是不应 403
		t.Fatalf("心跳路径不应被 403(404 正常), got %d", w.Code)
	}
}

func TestIPGuardTrustedProxyXFF(t *testing.T) {
	// 可信代理下,XFF 解析真实客户端 IP
	trusted, _ := parseIPListForTest("10.0.0.0/8")
	g := newTestGuard()
	conf := guard.NewPanelConfig("10.0.0.0/8", "", 3, 10*time.Minute, 15*time.Minute)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(IPGuard(conf, g, trusted))
	r.GET("/api/hello", func(c *gin.Context) { c.String(200, "ok") })
	req := httptest.NewRequest("GET", "/api/hello", nil)
	req.RemoteAddr = "10.0.0.1:1234" // 可信代理
	req.Header.Set("X-Forwarded-For", "192.168.1.9")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("XFF 中的真实客户端不在白名单应 403, got %d", w.Code)
	}
}

func parseIPListForTest(raw string) ([]*net.IPNet, error) {
	return gateway.ParseIPList(raw)
}