package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/tunnel"
	"aluka_ops/internal/service"
)

// TunnelController 流量隧道 API + Agent WS。
type TunnelController struct {
	svc *service.TunnelService
	hub *tunnel.Hub
}

func NewTunnelController(svc *service.TunnelService, hub *tunnel.Hub) *TunnelController {
	return &TunnelController{svc: svc, hub: hub}
}

// List GET /api/tunnels
func (h *TunnelController) List(c *gin.Context) {
	list, rt, sessions, err := h.svc.List()
	if err != nil {
		FailServer(c, err)
		return
	}
	items := make([]gin.H, 0, len(list))
	for _, r := range list {
		item := gin.H{"rule": r}
		if v, ok := rt[r.ID]; ok {
			item["runtime"] = v
		}
		items = append(items, item)
	}
	OK(c, gin.H{"items": items, "sessions": sessions})
}

// Sessions GET /api/tunnels/sessions
func (h *TunnelController) Sessions(c *gin.Context) {
	OK(c, gin.H{"items": h.svc.Sessions()})
}

// Get GET /api/tunnels/:id
func (h *TunnelController) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "invalid id")
		return
	}
	m, rt, err := h.svc.Get(uint(id))
	if err != nil {
		if errors.Is(err, service.ErrTunnelNotFound) {
			FailNotFound(c, "隧道规则")
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, gin.H{"rule": m, "runtime": rt})
}

// Create POST /api/tunnels
func (h *TunnelController) Create(c *gin.Context) {
	var in service.TunnelCreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.Create(in)
	if err != nil {
		if errors.Is(err, service.ErrTunnelInvalid) || errors.Is(err, service.ErrTunnelConflict) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, m)
}

// Update PUT /api/tunnels/:id
func (h *TunnelController) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "invalid id")
		return
	}
	var in service.TunnelUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.Update(uint(id), in)
	if err != nil {
		if errors.Is(err, service.ErrTunnelNotFound) {
			FailNotFound(c, "隧道规则")
			return
		}
		if errors.Is(err, service.ErrTunnelInvalid) || errors.Is(err, service.ErrTunnelConflict) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, m)
}

// Delete DELETE /api/tunnels/:id
func (h *TunnelController) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "invalid id")
		return
	}
	if err := h.svc.Delete(uint(id)); err != nil {
		if errors.Is(err, service.ErrTunnelNotFound) {
			FailNotFound(c, "隧道规则")
			return
		}
		FailServer(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// Enable POST /api/tunnels/:id/enable  body: {"enabled":true}
func (h *TunnelController) Enable(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "invalid id")
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		FailBind(c, err)
		return
	}
	m, err := h.svc.SetEnabled(uint(id), body.Enabled)
	if err != nil {
		if errors.Is(err, service.ErrTunnelNotFound) {
			FailNotFound(c, "隧道规则")
			return
		}
		Fail(c, 400, CodeErrBad, err.Error())
		return
	}
	OK(c, m)
}

// Reload POST /api/tunnels/reload
func (h *TunnelController) Reload(c *gin.Context) {
	if err := h.svc.Reload(); err != nil {
		FailServer(c, err)
		return
	}
	OK(c, gin.H{"ok": true})
}

// WS GET /api/tunnel/ws — Agent 专用。
func (h *TunnelController) WS(c *gin.Context) {
	if h.hub == nil {
		c.String(http.StatusServiceUnavailable, "tunnel hub not available")
		return
	}
	h.hub.HandleWS(c.Writer, c.Request)
}
