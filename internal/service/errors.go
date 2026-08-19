package service

import "errors"

// 业务错误。Controller 据此映射 HTTP 状态与提示。
var (
	ErrNotFound        = errors.New("资源不存在")
	ErrInvalidName     = errors.New("名称不能为空")
	ErrAlreadyRunning  = errors.New("服务已在运行")
	ErrNotRunning      = errors.New("服务未运行")
	ErrRuntimeRequired = errors.New("jar 类型服务必须绑定运行环境(JDK)")
	ErrInvalidConfig   = errors.New("配置无效")
	ErrCannotDelete    = errors.New("服务运行中,无法删除")
	ErrCannotModify    = errors.New("服务运行中,无法修改配置")
	ErrConflict        = errors.New("操作冲突,请刷新后重试")
	ErrAlreadyCurrent  = errors.New("该制品已是当前版本,无需切换")
	ErrNoConsole       = errors.New("进程未运行或控制台不可用,请先在本实例启动服务")
	ErrPanelInvalid    = errors.New("面板防护参数无效")
)

// IsNotFound 判断是否为"未找到"类错误。
func IsNotFound(err error) bool { return errors.Is(err, ErrNotFound) }

// IsClientErr 判断是否为客户端可纠正的业务错误(用于 HTTP 400 映射)。
func IsClientErr(err error) bool {
	switch {
	case errors.Is(err, ErrInvalidName),
		errors.Is(err, ErrRuntimeRequired),
		errors.Is(err, ErrInvalidConfig),
		errors.Is(err, ErrCannotDelete),
		errors.Is(err, ErrCannotModify),
		errors.Is(err, ErrConflict),
		errors.Is(err, ErrAlreadyRunning),
		errors.Is(err, ErrNotRunning),
		errors.Is(err, ErrAlreadyCurrent),
		errors.Is(err, ErrNoConsole),
		errors.Is(err, ErrPanelInvalid):
		return true
	}
	return false
}
