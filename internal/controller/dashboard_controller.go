package controller

import (
	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// DashboardController 仪表盘 HTTP handler。
type DashboardController struct {
	svc *service.DashboardService
}

// NewDashboardController 构造。
func NewDashboardController(svc *service.DashboardService) *DashboardController {
	return &DashboardController{svc: svc}
}

// Stats GET /api/dashboard/stats
func (h *DashboardController) Stats(c *gin.Context) {
	data, err := h.svc.Stats()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, data)
}
