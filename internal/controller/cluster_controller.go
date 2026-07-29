package controller

import (
	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// ClusterController 节点角色与中心连接。
type ClusterController struct {
	svc *service.ClusterService
}

func NewClusterController(svc *service.ClusterService) *ClusterController {
	return &ClusterController{svc: svc}
}

// Status GET /api/cluster/status
func (h *ClusterController) Status(c *gin.Context) {
	OK(c, h.svc.Status())
}

// Update PUT /api/cluster/config
func (h *ClusterController) Update(c *gin.Context) {
	var in service.ClusterConfigInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	st, err := h.svc.UpdateConfig(in)
	if err != nil {
		Fail(c, 400, CodeErrBad, err.Error())
		return
	}
	OK(c, st)
}

// Connect POST /api/cluster/connect — Agent 立即连接中心
func (h *ClusterController) Connect(c *gin.Context) {
	st, err := h.svc.ConnectNow()
	if err != nil {
		Fail(c, 400, CodeErrBad, err.Error())
		return
	}
	OK(c, st)
}

// Disconnect POST /api/cluster/disconnect — 停止心跳与隧道客户端
func (h *ClusterController) Disconnect(c *gin.Context) {
	OK(c, h.svc.Disconnect())
}
