package controller

import (
	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// OperationController 操作记录查询的 HTTP handler。
type OperationController struct {
	svc *service.ServiceService
}

// NewOperationController 构造。复用 ServiceService(它聚合了 operation 仓储)。
func NewOperationController(svc *service.ServiceService) *OperationController {
	return &OperationController{svc: svc}
}

// List GET /api/operations?type=&status=&limit=
// 返回附带 service_name / service_code 的操作记录,便于操作中心展示。
func (h *OperationController) List(c *gin.Context) {
	limit := atoiDefault(c.Query("limit"), 100)
	items, err := h.svc.ListOperationsEnriched(c.Query("type"), c.Query("status"), limit)
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// Get GET /api/operations/:id
func (h *OperationController) Get(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	op, err := h.svc.GetOperation(id)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "操作记录")
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, op)
}
