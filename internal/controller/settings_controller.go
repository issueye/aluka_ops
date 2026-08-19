package controller

import (
	"errors"
	"net"
	"strings"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/service"
)

// SettingsController 面板防护设置(/api/settings)。
type SettingsController struct {
	svc            *service.PanelSettingsService
	trustedProxies []*net.IPNet
}

// NewSettingsController 构造。
func NewSettingsController(svc *service.PanelSettingsService, trustedProxies []*net.IPNet) *SettingsController {
	return &SettingsController{svc: svc, trustedProxies: trustedProxies}
}

// Get GET /api/settings
func (h *SettingsController) Get(c *gin.Context) {
	out, err := h.svc.Get()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, out)
}

// UpdatePanel PUT /api/settings/panel
// 更新面板防护参数(热生效)。防自锁:新白名单非空时必须包含当前访问 IP。
func (h *SettingsController) UpdatePanel(c *gin.Context) {
	var in service.PanelSettingsUpdate
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	// 防自锁校验
	if in.IPWhitelist != nil {
		nw := strings.TrimSpace(*in.IPWhitelist)
		if nw != "" {
			ip := gateway.ClientIP(c.Request, h.trustedProxies)
			f, err := gateway.NewIPFilter(nw, "")
			if err != nil {
				Fail(c, 400, CodeErrBad, "白名单格式无效: "+err.Error())
				return
			}
			if ip == nil || !f.Allowed(ip) {
				Fail(c, 400, CodeErrBad, "新白名单未包含当前访问 IP,保存被拒绝(防误锁)")
				return
			}
		}
	}
	out, err := h.svc.Update(in)
	if err != nil {
		if errors.Is(err, service.ErrPanelInvalid) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, out)
}