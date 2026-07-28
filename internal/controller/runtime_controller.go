package controller

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// RuntimeController Runtime 的 HTTP handler。
type RuntimeController struct {
	svc *service.RuntimeService
}

// NewRuntimeController 构造。
func NewRuntimeController(svc *service.RuntimeService) *RuntimeController {
	return &RuntimeController{svc: svc}
}

// List GET /api/runtimes
func (h *RuntimeController) List(c *gin.Context) {
	items, err := h.svc.List()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// Detect GET /api/runtimes/detect
// 探测本机 JDK 安装位置,返回候选列表(含是否已登记)。
func (h *RuntimeController) Detect(c *gin.Context) {
	items, err := h.svc.DetectJDK()
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// Create POST /api/runtimes
func (h *RuntimeController) Create(c *gin.Context) {
	var in service.CreateRuntimeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	rt, err := h.svc.Create(in)
	if err != nil {
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	c.JSON(201, gin.H{"code": CodeOK, "message": "ok", "data": rt})
}

// Get GET /api/runtimes/:id
func (h *RuntimeController) Get(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	rt, err := h.svc.GetByID(id)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "Runtime")
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, rt)
}

// Update PUT /api/runtimes/:id
func (h *RuntimeController) Update(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	var in service.UpdateRuntimeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	rt, err := h.svc.Update(id, in)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "Runtime")
			return
		}
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, rt)
}

// Delete DELETE /api/runtimes/:id
func (h *RuntimeController) Delete(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	if err := h.svc.Delete(id); err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "Runtime")
			return
		}
		FailServer(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// parseID 从 :id 路径参数解析 uint。
func parseID(c *gin.Context) (uint, error) {
	n, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(n), nil
}
