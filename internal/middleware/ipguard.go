package middleware

import (
	"net"
	"net/http"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/pkg/guard"
)

// IPGuard 面板访问控制中间件:封禁表 + IP 黑白名单。
//
// 挂载要求:必须在 AuthRequired 之后,以便读取 operator=agent(机器流量);
// 未鉴权路径(如 /api/auth/login)Auth 会直接放行且不设 operator,仍会走进本中间件,
// 因此登录入口同样受 IP 名单与封禁保护——正是需要防护的面。
//
// 判定顺序:agent 机器流量放行 → 豁免路径放行 → 封禁 403 → 黑名单 403 → 白名单未命中 403 → 放行。
func IPGuard(conf *guard.PanelConfig, g *guard.Guard, trustedProxies []*net.IPNet) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Agent Token 认证的机器流量(Controller↔Agent 集群链路)整体放行
		if op, ok := c.Get("operator"); ok && op == "agent" {
			c.Next()
			return
		}
		// 豁免路径:健康检查(负载均衡探活)、心跳、隧道 WS(各自有密钥校验)
		switch c.Request.URL.Path {
		case "/api/health", "/api/agents/heartbeat", "/api/tunnel/ws":
			c.Next()
			return
		}
		ip := gateway.ClientIP(c.Request, trustedProxies)
		if ip == nil {
			c.Next()
			return
		}
		// 封禁(fail2ban 语义:封禁期内拒绝该 IP 全部请求)
		if banned, retryAfter := g.IsBanned(ip.String()); banned {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":       40301,
				"message":    "IP 已被临时封禁,请稍后再试",
				"data":       gin.H{"retry_after": int(retryAfter.Seconds())},
			})
			return
		}
		// IP 黑白名单
		if f := conf.Filter(); f != nil && !f.Allowed(ip) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":    40302,
				"message": "IP 不在面板访问白名单内",
				"data":    nil,
			})
			return
		}
		c.Next()
	}
}