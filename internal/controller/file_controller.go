package controller

import (
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/files"
)

// FileController data 目录内的文件管理。
type FileController struct {
	store *files.Store
}

// NewFileController 构造。
func NewFileController(store *files.Store) *FileController {
	return &FileController{store: store}
}

// List GET /api/files?path=
func (h *FileController) List(c *gin.Context) {
	path := c.Query("path")
	res, err := h.store.List(path)
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, res)
}

// Stat GET /api/files/stat?path=
func (h *FileController) Stat(c *gin.Context) {
	ent, err := h.store.Stat(c.Query("path"))
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, ent)
}

// Read GET /api/files/read?path=
func (h *FileController) Read(c *gin.Context) {
	content, ent, err := h.store.ReadText(c.Query("path"))
	if err != nil {
		h.mapErr(c, err)
		return
	}
	OK(c, gin.H{"entry": ent, "content": content})
}

// Download GET /api/files/download?path=
func (h *FileController) Download(c *gin.Context) {
	f, ent, err := h.store.OpenDownload(c.Query("path"))
	if err != nil {
		h.mapErr(c, err)
		return
	}
	defer f.Close()
	c.Header("Content-Disposition", `attachment; filename="`+ent.Name+`"`)
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.FormatInt(ent.Size, 10))
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, f)
}

// Mkdir POST /api/files/mkdir  {path, name?, parents?}
// path 可为完整相对路径;若带 name 则 path 为父目录。
func (h *FileController) Mkdir(c *gin.Context) {
	var in struct {
		Path    string `json:"path"`
		Name    string `json:"name"`
		Parents bool   `json:"parents"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	target := strings.TrimSpace(in.Path)
	if in.Name != "" {
		name := strings.TrimSpace(in.Name)
		name = strings.ReplaceAll(name, "\\", "/")
		name = strings.Trim(name, "/")
		if name == "" || strings.Contains(name, "..") {
			Fail(c, 400, CodeErrBad, "非法目录名")
			return
		}
		parent := strings.Trim(strings.ReplaceAll(strings.TrimSpace(in.Path), "\\", "/"), "/")
		if parent == "" || parent == "." {
			target = name
		} else {
			target = parent + "/" + name
		}
	}
	if target == "" {
		Fail(c, 400, CodeErrBad, "路径不能为空")
		return
	}
	if err := h.store.Mkdir(target, in.Parents || in.Name != ""); err != nil {
		h.mapErr(c, err)
		return
	}
	ent, _ := h.store.Stat(target)
	OK(c, ent)
}

// Write PUT /api/files/write  {path, content}
func (h *FileController) Write(c *gin.Context) {
	var in struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	if strings.TrimSpace(in.Path) == "" {
		Fail(c, 400, CodeErrBad, "路径不能为空")
		return
	}
	if err := h.store.WriteFile(in.Path, []byte(in.Content)); err != nil {
		h.mapErr(c, err)
		return
	}
	ent, _ := h.store.Stat(in.Path)
	OK(c, ent)
}

// Upload POST /api/files/upload  multipart: path(父目录), file
func (h *FileController) Upload(c *gin.Context) {
	parent := c.PostForm("path")
	fh, err := c.FormFile("file")
	if err != nil {
		Fail(c, 400, CodeErrBad, "缺少 file 字段")
		return
	}
	name := filepath.Base(fh.Filename)
	if name == "" || name == "." || name == ".." {
		Fail(c, 400, CodeErrBad, "非法文件名")
		return
	}
	// 可选覆盖名
	if n := strings.TrimSpace(c.PostForm("name")); n != "" {
		name = filepath.Base(n)
	}
	rel := files.JoinRel(parent, name)
	if rel == "" {
		Fail(c, 400, CodeErrBad, "非法路径")
		return
	}
	src, err := fh.Open()
	if err != nil {
		FailServer(c, err)
		return
	}
	defer src.Close()
	if err := h.store.SaveUpload(rel, src, fh.Size); err != nil {
		h.mapErr(c, err)
		return
	}
	ent, _ := h.store.Stat(rel)
	OK(c, ent)
}

// Rename PUT /api/files/rename  {from, to} 或 {path, new_name}
func (h *FileController) Rename(c *gin.Context) {
	var in struct {
		From    string `json:"from"`
		To      string `json:"to"`
		Path    string `json:"path"`
		NewName string `json:"new_name"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		FailBind(c, err)
		return
	}
	from, to := strings.TrimSpace(in.From), strings.TrimSpace(in.To)
	if from == "" && in.Path != "" {
		from = strings.TrimSpace(in.Path)
		// 同目录改名
		parent := ""
		if i := strings.LastIndex(strings.ReplaceAll(from, "\\", "/"), "/"); i >= 0 {
			parent = from[:i]
		}
		to = files.JoinRel(parent, in.NewName)
		if to == "" {
			Fail(c, 400, CodeErrBad, "非法新名称")
			return
		}
	}
	if from == "" || to == "" {
		Fail(c, 400, CodeErrBad, "from/to 不能为空")
		return
	}
	if err := h.store.Rename(from, to); err != nil {
		h.mapErr(c, err)
		return
	}
	ent, _ := h.store.Stat(to)
	OK(c, ent)
}

// Delete DELETE /api/files?path=&recursive=1
func (h *FileController) Delete(c *gin.Context) {
	path := c.Query("path")
	if strings.TrimSpace(path) == "" {
		Fail(c, 400, CodeErrBad, "path 不能为空")
		return
	}
	recursive := c.Query("recursive") == "1" || c.Query("recursive") == "true"
	if err := h.store.Remove(path, recursive); err != nil {
		h.mapErr(c, err)
		return
	}
	OKMsg(c, "已删除")
}

func (h *FileController) mapErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, files.ErrOutsideRoot):
		Fail(c, 403, CodeErrBad, "禁止访问根目录之外的路径")
	case errors.Is(err, files.ErrNotFound):
		FailNotFound(c, "文件")
	case errors.Is(err, files.ErrIsDir):
		Fail(c, 400, CodeErrBad, "目标是目录")
	case errors.Is(err, files.ErrNotDir):
		Fail(c, 400, CodeErrBad, "目标不是目录")
	case errors.Is(err, files.ErrExists):
		Fail(c, 409, CodeErrBad, "目标已存在")
	case errors.Is(err, files.ErrInvalidName):
		Fail(c, 400, CodeErrBad, "非法名称或路径")
	case errors.Is(err, files.ErrTooLarge):
		Fail(c, 413, CodeErrBad, "文件过大")
	case errors.Is(err, files.ErrNotText):
		Fail(c, 400, CodeErrBad, "不是可预览/编辑的文本文件")
	case errors.Is(err, files.ErrRootDelete):
		Fail(c, 400, CodeErrBad, "不能删除数据根目录")
	default:
		FailServer(c, err)
	}
}
