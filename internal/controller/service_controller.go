package controller

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/repository"
	"aluka_ops/internal/service"
)

// ServiceController 服务管理的 HTTP handler。
type ServiceController struct {
	svc *service.ServiceService
}

// NewServiceController 构造。
func NewServiceController(svc *service.ServiceService) *ServiceController {
	return &ServiceController{svc: svc}
}

// List GET /api/services?name=&status=&type=
func (h *ServiceController) List(c *gin.Context) {
	f := repository.ListFilter{
		Name:   c.Query("name"),
		Status: c.Query("status"),
		Type:   c.Query("type"),
	}
	items, err := h.svc.List(f)
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// Create POST /api/services
func (h *ServiceController) Create(c *gin.Context) {
	var in service.CreateServiceInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	svc, err := h.svc.Create(in)
	if err != nil {
		respondServiceErr(c, err)
		return
	}
	c.JSON(201, gin.H{"code": CodeOK, "message": "ok", "data": svc})
}

// Get GET /api/services/:id
func (h *ServiceController) Get(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	detail, err := h.svc.GetDetail(id)
	if err != nil {
		respondServiceErr(c, err)
		return
	}
	OK(c, detail)
}

// Update PUT /api/services/:id
func (h *ServiceController) Update(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	var in service.UpdateServiceInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	svc, err := h.svc.Update(id, in)
	if err != nil {
		respondServiceErr(c, err)
		return
	}
	OK(c, svc)
}

// Delete DELETE /api/services/:id
func (h *ServiceController) Delete(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	if err := h.svc.Delete(id); err != nil {
		respondServiceErr(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// Start POST /api/services/:id/start
func (h *ServiceController) Start(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	op, err := h.svc.Start(id)
	if err != nil {
		// 即使失败也返回 operation 记录(便于前端展示错误详情)
		if op != nil {
			c.JSON(200, gin.H{"code": CodeErrSrv, "message": err.Error(), "data": gin.H{"operation": op}})
			return
		}
		respondServiceErr(c, err)
		return
	}
	OK(c, gin.H{"operation": op})
}

// Stop POST /api/services/:id/stop
func (h *ServiceController) Stop(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	op, err := h.svc.Stop(id)
	if err != nil {
		if op != nil {
			c.JSON(200, gin.H{"code": CodeErrSrv, "message": err.Error(), "data": gin.H{"operation": op}})
			return
		}
		respondServiceErr(c, err)
		return
	}
	OK(c, gin.H{"operation": op})
}

// Restart POST /api/services/:id/restart
func (h *ServiceController) Restart(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	op, err := h.svc.Restart(id)
	if err != nil {
		if op != nil {
			c.JSON(200, gin.H{"code": CodeErrSrv, "message": err.Error(), "data": gin.H{"operation": op}})
			return
		}
		respondServiceErr(c, err)
		return
	}
	OK(c, gin.H{"operation": op})
}

// Status GET /api/services/:id/status
func (h *ServiceController) Status(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	status, err := h.svc.GetStatus(id)
	if err != nil {
		respondServiceErr(c, err)
		return
	}
	OK(c, status)
}

// GetConfig GET /api/services/:id/config
func (h *ServiceController) GetConfig(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	// 复用 GetDetail 返回的 config 字段
	detail, err := h.svc.GetDetail(id)
	if err != nil {
		respondServiceErr(c, err)
		return
	}
	OK(c, detail["config"])
}

// Operations GET /api/services/:id/operations
func (h *ServiceController) Operations(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	limit := atoiDefault(c.Query("limit"), 50)
	items, err := h.svc.ListServiceOperations(id, limit)
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// respondServiceErr 统一处理 Service 层错误到 HTTP 响应。
func respondServiceErr(c *gin.Context, err error) {
	if service.IsNotFound(err) {
		FailNotFound(c, "服务")
		return
	}
	if service.IsClientErr(err) {
		Fail(c, 400, CodeErrBad, err.Error())
		return
	}
	FailServer(c, err)
}

// atoiDefault 字符串转 int,失败用默认值。
func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
