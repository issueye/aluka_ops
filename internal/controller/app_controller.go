package controller

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// AppController 代理端口 / APP / 端口反代。
type AppController struct {
	svc *service.AppGatewayService
}

func NewAppController(svc *service.AppGatewayService) *AppController {
	return &AppController{svc: svc}
}

// ----- runtime -----

func (h *AppController) Status(c *gin.Context) {
	OK(c, gin.H{"runtime": h.svc.RuntimeStatus()})
}

func (h *AppController) Reload(c *gin.Context) {
	if err := h.svc.Reload(); err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, gin.H{"runtime": h.svc.RuntimeStatus()})
}

// ----- ports -----

func (h *AppController) ListPorts(c *gin.Context) {
	list, err := h.svc.ListPorts()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, gin.H{"items": list, "runtime": h.svc.RuntimeStatus()})
}

func (h *AppController) GetPort(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	m, err := h.svc.GetPort(id)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) CreatePort(c *gin.Context) {
	var in service.PortCreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.CreatePort(in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) UpdatePort(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	var in service.PortUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.UpdatePort(id, in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) DeletePort(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	force := c.Query("force") == "1" || c.Query("force") == "true"
	if err := h.svc.DeletePort(id, force); err != nil {
		h.mapErr(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// ----- apps -----

func (h *AppController) ListApps(c *gin.Context) {
	list, err := h.svc.ListApps()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, gin.H{"items": list, "runtime": h.svc.RuntimeStatus()})
}

func (h *AppController) GetApp(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	m, err := h.svc.GetApp(id)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) CreateApp(c *gin.Context) {
	var in service.AppCreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.CreateApp(in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) UpdateApp(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	var in service.AppUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.UpdateApp(id, in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) DeleteApp(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteApp(id); err != nil {
		h.mapErr(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// ----- proxies (under port) -----

func (h *AppController) ListProxies(c *gin.Context) {
	if pid := c.Query("port_id"); pid != "" {
		id, err := strconv.ParseUint(pid, 10, 64)
		if err != nil {
			Fail(c, 400, CodeErrBad, "port_id 无效")
			return
		}
		list, err := h.svc.ListProxiesByPort(uint(id))
		if err != nil {
			FailServer(c, err)
			return
		}
		OK(c, gin.H{"items": list})
		return
	}
	list, err := h.svc.ListProxies()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, gin.H{"items": list})
}

func (h *AppController) GetProxy(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	m, err := h.svc.GetProxy(id)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) CreateProxy(c *gin.Context) {
	var in service.ProxyCreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.CreateProxy(in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) UpdateProxy(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	var in service.ProxyUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.UpdateProxy(id, in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) DeleteProxy(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteProxy(id); err != nil {
		h.mapErr(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// ----- route scripts (under port) -----

// ListScriptTemplates GET /api/gateway/script-templates
func (h *AppController) ListScriptTemplates(c *gin.Context) {
	OK(c, gin.H{"items": h.svc.ListScriptTemplates()})
}

// GetScriptTemplate GET /api/gateway/script-templates/:id
func (h *AppController) GetScriptTemplate(c *gin.Context) {
	id := c.Param("id")
	t, err := h.svc.GetScriptTemplate(id)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, t)
}

func (h *AppController) ListScripts(c *gin.Context) {
	if pid := c.Query("port_id"); pid != "" {
		id, err := strconv.ParseUint(pid, 10, 64)
		if err != nil {
			Fail(c, 400, CodeErrBad, "port_id 无效")
			return
		}
		list, err := h.svc.ListScriptsByPort(uint(id))
		if err != nil {
			FailServer(c, err)
			return
		}
		OK(c, gin.H{"items": list})
		return
	}
	list, err := h.svc.ListScripts()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, gin.H{"items": list})
}

func (h *AppController) GetScript(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	m, err := h.svc.GetScript(id)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) CreateScript(c *gin.Context) {
	var in service.ScriptCreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.CreateScript(in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) UpdateScript(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	var in service.ScriptUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.UpdateScript(id, in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

func (h *AppController) DeleteScript(c *gin.Context) {
	id, ok := parseUID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteScript(id); err != nil {
		h.mapErr(c, err)
		return
	}
	OKMsg(c, "已删除")
}

func parseUID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "无效 id")
		return 0, false
	}
	return uint(id), true
}

func (h *AppController) mapErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrPortNotFound):
		FailNotFound(c, "代理端口")
	case errors.Is(err, service.ErrAppNotFound):
		FailNotFound(c, "APP")
	case errors.Is(err, service.ErrProxyNotFound):
		FailNotFound(c, "反代规则")
	case errors.Is(err, service.ErrScriptNotFound):
		FailNotFound(c, "路由脚本")
	case errors.Is(err, service.ErrPortExists),
		errors.Is(err, service.ErrAppCodeExists),
		errors.Is(err, service.ErrProxyCodeExists),
		errors.Is(err, service.ErrScriptCodeExists),
		errors.Is(err, service.ErrPortInUse):
		Fail(c, 409, CodeErrBad, err.Error())
	case errors.Is(err, service.ErrAppInvalid),
		errors.Is(err, service.ErrListenFailed):
		Fail(c, 400, CodeErrBad, err.Error())
	default:
		FailServer(c, err)
	}
}
