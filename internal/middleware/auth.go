package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/auth"
)

// AuthRequired 鉴权中间件。
// 未启用鉴权时直接放行;启用后要求 Authorization: Bearer <token>
// 或查询参数 ?token= (兼容 EventSource SSE 无法自定义 Header)。
// agentToken 可为固定字符串,或运行时通过 agentTokenFn 读取(前端改配置后立即生效)。
func AuthRequired(store *auth.Store, agentToken string) gin.HandlerFunc {
	return AuthRequiredFn(store, func() string { return agentToken })
}

// AuthRequiredFn 与 AuthRequired 相同,但 Agent Token 每次请求动态获取。
func AuthRequiredFn(store *auth.Store, agentTokenFn func() string) gin.HandlerFunc {
	if agentTokenFn == nil {
		agentTokenFn = func() string { return "" }
	}
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		// 白名单:登录、健康检查、Agent 心跳、隧道 WS(由 Hub 校验 token)
		if path == "/api/health" || path == "/api/auth/login" || path == "/api/auth/status" ||
			path == "/api/agents/heartbeat" || path == "/api/tunnel/ws" {
			c.Next()
			return
		}
		// Agent Token 访问 /api/agent/* 或 /api/agents/*
		agentToken := agentTokenFn()
		if agentToken != "" && (strings.HasPrefix(path, "/api/agent/") || path == "/api/agent" ||
			strings.HasPrefix(path, "/api/agents/")) {
			got := c.GetHeader("X-Agent-Token")
			if got == "" {
				got = c.Query("agent_token")
			}
			if subtle.ConstantTimeCompare([]byte(got), []byte(agentToken)) == 1 {
				c.Set("operator", "agent")
				c.Next()
				return
			}
		}

		if store == nil || !store.Enabled() {
			c.Next()
			return
		}

		token := extractToken(c)
		if !store.Valid(token) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    40100,
				"message": "未登录或 Token 已失效,请重新登录",
				"data":    nil,
			})
			return
		}
		c.Set("auth_token", token)
		c.Set("operator", "admin")
		c.Next()
	}
}

func extractToken(c *gin.Context) string {
	// 1) Authorization: Bearer xxx
	h := c.GetHeader("Authorization")
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	// 2) 查询参数(SSE)
	if t := c.Query("token"); t != "" {
		return t
	}
	// 3) 兼容 X-Token
	if t := c.GetHeader("X-Token"); t != "" {
		return t
	}
	return ""
}
