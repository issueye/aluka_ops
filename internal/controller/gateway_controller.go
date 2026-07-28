package controller

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// GatewayController 网关规则管理。
type GatewayController struct {
	svc *service.GatewayService
}

func NewGatewayController(svc *service.GatewayService) *GatewayController {
	return &GatewayController{svc: svc}
}

// List GET /api/gateway/rules
func (h *GatewayController) List(c *gin.Context) {
	list, err := h.svc.List()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, gin.H{
		"items":   list,
		"runtime": h.svc.RuntimeStatus(),
	})
}

// Get GET /api/gateway/rules/:id
func (h *GatewayController) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "无效 id")
		return
	}
	m, err := h.svc.Get(uint(id))
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

// Create POST /api/gateway/rules
func (h *GatewayController) Create(c *gin.Context) {
	var in service.GatewayCreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.Create(in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

// Update PUT /api/gateway/rules/:id
func (h *GatewayController) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "无效 id")
		return
	}
	var in service.GatewayUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.Update(uint(id), in)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

// Delete DELETE /api/gateway/rules/:id
func (h *GatewayController) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "无效 id")
		return
	}
	if err := h.svc.Delete(uint(id)); err != nil {
		h.mapErr(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// Enable POST /api/gateway/rules/:id/enable
func (h *GatewayController) Enable(c *gin.Context) {
	h.setEnabled(c, true)
}

// Disable POST /api/gateway/rules/:id/disable
func (h *GatewayController) Disable(c *gin.Context) {
	h.setEnabled(c, false)
}

func (h *GatewayController) setEnabled(c *gin.Context, en bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "无效 id")
		return
	}
	m, err := h.svc.SetEnabled(uint(id), en)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, m)
}

// Reload POST /api/gateway/reload
func (h *GatewayController) Reload(c *gin.Context) {
	if err := h.svc.Reload(); err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, gin.H{"runtime": h.svc.RuntimeStatus()})
}

// Status GET /api/gateway/status
func (h *GatewayController) Status(c *gin.Context) {
	OK(c, gin.H{"runtime": h.svc.RuntimeStatus()})
}

func (h *GatewayController) mapErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrGatewayNotFound):
		FailNotFound(c, "网关规则")
	case errors.Is(err, service.ErrGatewayCodeExists):
		Fail(c, 409, CodeErrBad, err.Error())
	case errors.Is(err, service.ErrGatewayInvalid):
		Fail(c, 400, CodeErrBad, err.Error())
	case errors.Is(err, service.ErrGatewayPortBusy):
		Fail(c, 409, CodeErrBad, err.Error())
	default:
		FailServer(c, err)
	}
}
