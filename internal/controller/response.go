// Package controller 是 MVC 的视图/控制层:HTTP handler 与统一响应封装。
package controller

import "github.com/gin-gonic/gin"

// APIError 标准错误结构。
type APIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// 全局业务码。
const (
	CodeOK       = 0
	CodeErrBad   = 40000 // 参数错误
	CodeErrNotF  = 40400 // 未找到
	CodeErrSrv   = 50000 // 服务端错误
	CodeErrImpl  = 50100 // 尚未实现(占位)
)

// OK 返回成功响应。
func OK(c *gin.Context, data any) {
	c.JSON(200, gin.H{
		"code":    CodeOK,
		"message": "ok",
		"data":    data,
	})
}

// OKMsg 返回不带数据的成功响应。
func OKMsg(c *gin.Context, msg string) {
	c.JSON(200, gin.H{
		"code":    CodeOK,
		"message": msg,
		"data":    nil,
	})
}

// Fail 返回错误响应。
func Fail(c *gin.Context, httpStatus, code int, msg string) {
	c.JSON(httpStatus, gin.H{
		"code":    code,
		"message": msg,
		"data":    nil,
	})
}

// FailBind 处理参数绑定失败。
func FailBind(c *gin.Context, err error) {
	Fail(c, 400, CodeErrBad, "参数错误: "+err.Error())
}

// FailNotFound 未找到资源。
func FailNotFound(c *gin.Context, what string) {
	Fail(c, 404, CodeErrNotF, what+"未找到")
}

// FailServer 服务端错误。
func FailServer(c *gin.Context, err error) {
	Fail(c, 500, CodeErrSrv, err.Error())
}

// NotImplemented 占位响应:路由已注册,业务待后续阶段实现。
func NotImplemented(c *gin.Context, feature string) {
	Fail(c, 501, CodeErrImpl, feature+"将在后续阶段实现")
}
