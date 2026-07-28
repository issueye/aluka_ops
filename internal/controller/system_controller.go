package controller

import (
	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/hostinfo"
)

// SystemController 本机系统信息。
type SystemController struct {
	host *hostinfo.Collector
}

// NewSystemController 构造。
func NewSystemController(host *hostinfo.Collector) *SystemController {
	return &SystemController{host: host}
}

// Host GET /api/system/host
// 返回当前服务器 CPU/内存/磁盘等快照,供前端定时拉取。
func (h *SystemController) Host(c *gin.Context) {
	if h.host == nil {
		FailServer(c, errHostUnavailable)
		return
	}
	OK(c, h.host.Get())
}

type hostUnavailableError struct{}

func (hostUnavailableError) Error() string { return "主机信息采集器未初始化" }

var errHostUnavailable = hostUnavailableError{}
