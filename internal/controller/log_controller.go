package controller

import (
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/pkg/logstream"
	"aluka_ops/internal/service"
)

// LogController 日志流(SSE)与历史查询。
type LogController struct {
	svc *service.ServiceService
	hub *logstream.LogHub
}

// NewLogController 构造。
func NewLogController(svc *service.ServiceService, hub *logstream.LogHub) *LogController {
	return &LogController{svc: svc, hub: hub}
}

// Stream GET /api/services/:id/logs/stream?lines=200
//
// 建立长连接,先下发日志尾部历史,再持续推送新增内容。
// 客户端断开时自动清理订阅。SSE 事件:
//
//	event: meta      data: {"service_id":..,"file":".."}
//	event: history   data: <一行历史>
//	event: log       data: <一段新增内容>
//	event: end       data: <结束原因>
func (h *LogController) Stream(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	lines := atoiDefault(c.Query("lines"), 200)

	// 解析最新日志文件路径(可能为空——服务未启动过)
	logFile, code, err := h.svc.GetLatestLogPath(id)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "服务")
			return
		}
		FailServer(c, err)
		return
	}

	// SSE 响应头
	header := c.Writer.Header()
	header["Content-Type"] = []string{"text/event-stream"}
	header["Cache-Control"] = []string{"no-cache"}
	header["Connection"] = []string{"keep-alive"}
	header["X-Accel-Buffering"] = []string{"no"} // 禁代理缓冲
	c.Writer.WriteHeader(http.StatusOK)
	// 立即 flush 头,让客户端尽早进入事件流
	c.Writer.Flush()

	// 订阅
	sub := h.hub.Subscribe(id, code, logFile, lines)
	defer func() {
		h.hub.Unsubscribe(id, sub)
	}()

	// 若日志文件尚不存在,先发一条 end 提示(但仍保持连接,等待服务启动)
	if logFile == "" {
		writeSSE(c.Writer, logstream.EventMeta, []byte(`{"service_id":`+strconv.FormatUint(uint64(id), 10)+`,"file":"","note":"服务尚未启动,无日志文件"}`))
	}

	ctx := c.Request.Context()
	c.Stream(func(w io.Writer) bool {
		select {
		case <-ctx.Done():
			// 客户端断开
			return false
		case <-sub.Done():
			writeSSE(w, logstream.EventEnd, []byte("订阅已关闭"))
			return false
		case msg, ok := <-sub.C():
			if !ok {
				return false
			}
			writeSSE(w, msg.Event, msg.Data)
			return true
		}
	})
}

// History GET /api/services/:id/logs?lines=1000
// 返回最新日志文件的尾部 N 行(JSON)。
func (h *LogController) History(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	lines := atoiDefault(c.Query("lines"), 1000)

	logFile, _, err := h.svc.GetLatestLogPath(id)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "服务")
			return
		}
		FailServer(c, err)
		return
	}
	if logFile == "" {
		OK(c, gin.H{"lines": []string{}, "file": "", "exists": false})
		return
	}
	data, err := logstream.TailLines(logFile, lines)
	if err != nil {
		OK(c, gin.H{"lines": []string{}, "file": logFile, "exists": false, "error": err.Error()})
		return
	}
	OK(c, gin.H{"lines": data, "file": logFile, "exists": true})
}

// Download GET /api/services/:id/logs/file
// 以附件形式下载最新日志文件。
func (h *LogController) Download(c *gin.Context) {
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	logFile, _, err := h.svc.GetLatestLogPath(id)
	if err != nil {
		if service.IsNotFound(err) {
			FailNotFound(c, "服务")
			return
		}
		FailServer(c, err)
		return
	}
	if logFile == "" {
		Fail(c, 404, CodeErrNotF, "日志文件不存在(服务可能未启动过)")
		return
	}
	filename := fmt.Sprintf("service-%d.log", id)
	c.FileAttachment(logFile, filename)
}

// writeSSE 向 SSE 输出流写入一个事件。
// data 按换行拆分为多行 data: 字段(SSE 规范)。
func writeSSE(w io.Writer, event logstream.Event, data []byte) {
	// event 行
	fmt.Fprintf(w, "event: %s\n", event)
	// data 行:按 \n 拆分,每段前加 "data: "
	// 末尾保留换行以保证 SSE 消息边界
	s := string(data)
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			fmt.Fprintf(w, "data: %s\n", s[start:i])
			start = i + 1
		}
	}
	fmt.Fprintf(w, "data: %s\n\n", s[start:])
}
