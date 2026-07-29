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
// 配置会落库;若 connect=true 且连中心失败,仍返回 200 + data, message 带失败原因。
func (h *ClusterController) Update(c *gin.Context) {
	var in service.ClusterConfigInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	st, err := h.svc.UpdateConfig(in)
	if err != nil {
		// 区分「参数错误」与「连接失败」:有 status 数据时用 200 带回
		if st != nil {
			c.JSON(200, gin.H{
				"code":    CodeOK,
				"message": "配置已保存,但连接中心失败: " + err.Error(),
				"data":    st,
			})
			return
		}
		Fail(c, 400, CodeErrBad, err.Error())
		return
	}
	OK(c, st)
}

// Connect POST /api/cluster/connect — Agent 立即连接中心
func (h *ClusterController) Connect(c *gin.Context) {
	st, err := h.svc.ConnectNow()
	if err != nil {
		if st != nil {
			c.JSON(200, gin.H{
				"code":    CodeOK,
				"message": err.Error(),
				"data":    st,
			})
			return
		}
		Fail(c, 400, CodeErrBad, err.Error())
		return
	}
	OKMsg := "已连接中心"
	if ok, _ := st["connect_ok"].(bool); ok {
		OK(c, st)
		return
	}
	c.JSON(200, gin.H{"code": CodeOK, "message": OKMsg, "data": st})
}

// Disconnect POST /api/cluster/disconnect — 停止心跳与隧道客户端
func (h *ClusterController) Disconnect(c *gin.Context) {
	OK(c, h.svc.Disconnect())
}
