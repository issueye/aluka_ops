package controller

import (
	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// AuditController 审计日志 HTTP handler。
type AuditController struct {
	svc *service.AuditService
}

// NewAuditController 构造。
func NewAuditController(svc *service.AuditService) *AuditController {
	return &AuditController{svc: svc}
}

// List GET /api/audit-logs?action=&target_type=&limit=
func (h *AuditController) List(c *gin.Context) {
	limit := atoiDefault(c.Query("limit"), 100)
	items, err := h.svc.List(c.Query("action"), c.Query("target_type"), limit)
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// Get GET /api/audit-logs/:id
func (h *AuditController) Get(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	item, err := h.svc.Get(id)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "审计日志")
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, item)
}
