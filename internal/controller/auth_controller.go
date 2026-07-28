package controller

import (
	"time"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/auth"
)

// AuthController 登录鉴权。
type AuthController struct {
	store *auth.Store
}

// NewAuthController 构造。
func NewAuthController(store *auth.Store) *AuthController {
	return &AuthController{store: store}
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
	token, exp, ok := h.store.Login(body.Password)
	if !ok {
		Fail(c, 401, 40101, "密码错误")
		return
	}
	OK(c, gin.H{
		"auth_enabled": true,
		"token":        token,
		"expires_at":   exp.Format(time.RFC3339),
	})
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
