package controller

import (
	"fmt"
	"net"
	"time"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/auth"
	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/pkg/guard"
)

// AuthController 登录鉴权。
type AuthController struct {
	store          *auth.Store
	guard          *guard.Guard // 登录防爆破(可空)
	trustedProxies []*net.IPNet
}

// NewAuthController 构造。
func NewAuthController(store *auth.Store, g *guard.Guard, trustedProxies []*net.IPNet) *AuthController {
	return &AuthController{store: store, guard: g, trustedProxies: trustedProxies}
}

// Status GET /api/auth/status
// 返回是否启用鉴权、当前是否已登录(若带 Token)。
func (h *AuthController) Status(c *gin.Context) {
	enabled := h.store != nil && h.store.Enabled()
	authenticated := false
	if enabled {
		token := c.GetHeader("Authorization")
		if len(token) > 7 && (token[:7] == "Bearer " || token[:7] == "bearer ") {
			authenticated = h.store.Valid(token[7:])
		} else if t := c.Query("token"); t != "" {
			authenticated = h.store.Valid(t)
		}
	}
	OK(c, gin.H{
		"auth_enabled":  enabled,
		"authenticated": authenticated || !enabled,
	})
}

// LoginBody 登录请求。
type LoginBody struct {
	Password string `json:"password" binding:"required"`
}

// Login POST /api/auth/login
func (h *AuthController) Login(c *gin.Context) {
	if h.store == nil || !h.store.Enabled() {
		OK(c, gin.H{
			"auth_enabled": false,
			"token":        "",
			"message":      "鉴权未启用",
		})
		return
	}
	var body LoginBody
	if err := c.ShouldBindJSON(&body); err != nil {
		FailBind(c, err)
		return
	}
	// 登录防爆破(与 ipguard 中间件同源:同一真实客户端 IP)
	ip := gateway.ClientIP(c.Request, h.trustedProxies)
	if ip != nil && h.guard != nil {
		if banned, retryAfter := h.guard.IsBanned(ip.String()); banned {
			Fail(c, 403, 40301, fmt.Sprintf("IP 已被临时封禁,请 %d 秒后重试", int(retryAfter.Seconds())))
			return
		}
	}
	token, exp, ok := h.store.Login(body.Password)
	if !ok {
		if ip != nil && h.guard != nil {
			if banned, banFor := h.guard.RecordFailure(ip.String()); banned {
				Fail(c, 429, 42901, fmt.Sprintf("尝试次数过多,该 IP 已被临时封禁 %d 秒", int(banFor.Seconds())))
				return
			}
		}
		Fail(c, 401, 40101, "密码错误")
		return
	}
	if ip != nil && h.guard != nil {
		h.guard.RecordSuccess(ip.String())
	}
	OK(c, gin.H{
		"auth_enabled": true,
		"token":        token,
		"expires_at":   exp.Format(time.RFC3339),
	})
}

// GuardList GET /api/auth/guard
// 当前封禁列表与登录失败计数。
func (h *AuthController) GuardList(c *gin.Context) {
	if h.guard == nil {
		OK(c, gin.H{"bans": []guard.BanInfo{}, "failures": []guard.FailInfo{}})
		return
	}
	OK(c, gin.H{"bans": h.guard.Bans(), "failures": h.guard.Failures()})
}

// Unban DELETE /api/auth/guard/bans/:ip
// 人工解封指定 IP(写操作自动进入审计)。
func (h *AuthController) Unban(c *gin.Context) {
	ip := c.Param("ip")
	if ip == "" {
		Fail(c, 400, CodeErrBad, "ip 无效")
		return
	}
	if h.guard == nil || !h.guard.Unban(ip) {
		OKMsg(c, "该 IP 未被封禁")
		return
	}
	OKMsg(c, "已解封 "+ip)
}

// Logout POST /api/auth/logout
func (h *AuthController) Logout(c *gin.Context) {
	if h.store == nil || !h.store.Enabled() {
		OKMsg(c, "ok")
		return
	}
	token, _ := c.Get("auth_token")
	if t, ok := token.(string); ok && t != "" {
		h.store.Revoke(t)
	} else {
		// 尝试从 header 取
		authHeader := c.GetHeader("Authorization")
		if len(authHeader) > 7 {
			h.store.Revoke(authHeader[7:])
		}
	}
	OKMsg(c, "已退出")
}
