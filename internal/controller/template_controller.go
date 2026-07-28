package controller

import (
	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// TemplateController 服务模板 HTTP handler。
type TemplateController struct {
	svc *service.TemplateService
}

// NewTemplateController 构造。
func NewTemplateController(svc *service.TemplateService) *TemplateController {
	return &TemplateController{svc: svc}
}

// List GET /api/templates
func (h *TemplateController) List(c *gin.Context) {
	items, err := h.svc.List()
	if err != nil {
		FailServer(c, err)
		return
	}
	// 附加 vars 字段,便于前端展示
	out := make([]gin.H, 0, len(items))
	for _, t := range items {
		out = append(out, gin.H{
			"id":                 t.ID,
			"created_at":         t.CreatedAt,
			"updated_at":         t.UpdatedAt,
			"name":               t.Name,
			"type":               t.Type,
			"description":        t.Description,
			"install_steps":      t.InstallSteps,
			"config_template":    t.ConfigTemplate,
			"default_runtime_id": t.DefaultRuntimeID,
			"vars":               service.ExtractTemplateVars(t.ConfigTemplate),
		})
	}
	OK(c, out)
}

// Get GET /api/templates/:id
func (h *TemplateController) Get(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	t, err := h.svc.Get(id)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "模板")
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, gin.H{
		"id":                 t.ID,
		"created_at":         t.CreatedAt,
		"updated_at":         t.UpdatedAt,
		"name":               t.Name,
		"type":               t.Type,
		"description":        t.Description,
		"install_steps":      t.InstallSteps,
		"config_template":    t.ConfigTemplate,
		"default_runtime_id": t.DefaultRuntimeID,
		"vars":               service.ExtractTemplateVars(t.ConfigTemplate),
	})
}

// Create POST /api/templates
func (h *TemplateController) Create(c *gin.Context) {
	var in service.CreateTemplateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	t, err := h.svc.Create(in)
	if err != nil {
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	c.JSON(201, gin.H{"code": CodeOK, "message": "ok", "data": t})
}

// Update PUT /api/templates/:id
func (h *TemplateController) Update(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	var in service.UpdateTemplateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	t, err := h.svc.Update(id, in)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "模板")
			return
		}
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, t)
}

// Delete DELETE /api/templates/:id
func (h *TemplateController) Delete(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	if err := h.svc.Delete(id); err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "模板")
			return
		}
		FailServer(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// Apply POST /api/templates/:id/apply
// 从模板创建服务。
func (h *TemplateController) Apply(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	var in service.ApplyTemplateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	svc, err := h.svc.Apply(id, in)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "模板")
			return
		}
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	c.JSON(201, gin.H{"code": CodeOK, "message": "ok", "data": svc})
}
