package controller

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/model"
	"aluka_ops/internal/service"
)

// ArtifactController 制品管理与安装/卸载的 HTTP handler。
type ArtifactController struct {
	artSvc *service.ArtifactService
	svcSvc *service.ServiceService
}

// NewArtifactController 构造。
func NewArtifactController(artSvc *service.ArtifactService, svcSvc *service.ServiceService) *ArtifactController {
	return &ArtifactController{artSvc: artSvc, svcSvc: svcSvc}
}

// List GET /api/services/:id/artifacts
func (h *ArtifactController) List(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	items, err := h.artSvc.List(id)
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// Upload POST /api/services/:id/artifacts
// multipart/form-data: file(必填) + version(必填) + description(可选)
func (h *ArtifactController) Upload(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		Fail(c, 400, CodeErrBad, "缺少上传文件: "+err.Error())
		return
	}
	version := c.PostForm("version")
	if version == "" {
		Fail(c, 400, CodeErrBad, "缺少版本号 version")
		return
	}
	in := service.UploadInput{
		Version:     version,
		Description: c.PostForm("description"),
	}
	a, err := h.artSvc.Upload(id, fh, in)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "服务")
			return
		}
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	c.JSON(201, gin.H{"code": CodeOK, "message": "ok", "data": a})
}

// Get GET /api/services/:id/artifacts/:aid
func (h *ArtifactController) Get(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	aid, err := parseAID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	a, err := h.artSvc.Get(id, aid)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "制品")
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, a)
}

// Delete DELETE /api/services/:id/artifacts/:aid
func (h *ArtifactController) Delete(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	aid, err := parseAID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	if err := h.artSvc.Delete(id, aid); err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "制品")
			return
		}
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	OKMsg(c, "已删除")
}

// Download GET /api/services/:id/artifacts/:aid/download
func (h *ArtifactController) Download(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	aid, err := parseAID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	a, path, err := h.artSvc.ResolveFile(id, aid)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "制品")
			return
		}
		FailServer(c, err)
		return
	}
	c.FileAttachment(path, a.Filename)

}

// Install POST /api/services/:id/install?artifact_id=X
func (h *ArtifactController) Install(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	aidStr := c.Query("artifact_id")
	if aidStr == "" {
		Fail(c, 400, CodeErrBad, "缺少 artifact_id 参数")
		return
	}
	aid, err := strconv.ParseUint(aidStr, 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "artifact_id 无效")
		return
	}
	op, err := h.svcSvc.Install(id, uint(aid))
	respondActionResult(c, op, err)
}

// Upgrade POST /api/services/:id/upgrade?artifact_id=X
// 升级到指定制品。部署失败自动回滚到当前版本。
func (h *ArtifactController) Upgrade(c *gin.Context) {
	id, aid, ok := parseServiceArtifactID(c)
	if !ok {
		return
	}
	op, err := h.svcSvc.Upgrade(id, aid)
	respondActionResult(c, op, err)
}

// Rollback POST /api/services/:id/rollback?artifact_id=X
// 回滚到指定历史制品(非当前版本)。部署失败自动回滚到当前版本。
func (h *ArtifactController) Rollback(c *gin.Context) {
	id, aid, ok := parseServiceArtifactID(c)
	if !ok {
		return
	}
	op, err := h.svcSvc.Rollback(id, aid)
	respondActionResult(c, op, err)
}

// parseServiceArtifactID 解析 :id 与 ?artifact_id,供 upgrade/rollback 复用。
func parseServiceArtifactID(c *gin.Context) (uint, uint, bool) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return 0, 0, false
	}
	aidStr := c.Query("artifact_id")
	if aidStr == "" {
		Fail(c, 400, CodeErrBad, "缺少 artifact_id 参数")
		return 0, 0, false
	}
	aid, err := strconv.ParseUint(aidStr, 10, 64)
	if err != nil {
		Fail(c, 400, CodeErrBad, "artifact_id 无效")
		return 0, 0, false
	}
	return id, uint(aid), true
}

// Uninstall POST /api/services/:id/uninstall?keep_data=true
func (h *ArtifactController) Uninstall(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	keepData := c.Query("keep_data") == "true"
	op, err := h.svcSvc.Uninstall(id, keepData)
	respondActionResult(c, op, err)
}

// parseAID 从 :aid 路径参数解析 uint。
func parseAID(c *gin.Context) (uint, error) {
	n, err := strconv.ParseUint(c.Param("aid"), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(n), nil
}

// respondActionResult 统一处理 install/uninstall 等动作的响应(返回 operation)。
func respondActionResult(c *gin.Context, op *model.Operation, err error) {
	if err != nil {
		if op != nil {
			c.JSON(200, gin.H{"code": CodeErrSrv, "message": err.Error(), "data": gin.H{"operation": op}})
			return
		}
		if service.IsNotFound(err) {
			FailNotFound(c, "服务或制品")
			return
		}
		if service.IsClientErr(err) {
			Fail(c, 400, CodeErrBad, err.Error())
			return
		}
		FailServer(c, err)
		return
	}
	OK(c, gin.H{"operation": op})
}
