// Package middleware 提供 HTTP 中间件。
package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

// bodyWriter 捕获响应体(仅用于解析 code,不改写响应)。
type bodyWriter struct {
	gin.ResponseWriter
	buf bytes.Buffer
}

func (w *bodyWriter) Write(b []byte) (int, error) {
	w.buf.Write(b)
	return w.ResponseWriter.Write(b)
}

// AuditWrite 记录写操作(POST/PUT/DELETE)的审计日志。
// 成功(HTTP < 400 且业务 code=0 或无 code)时落库。
func AuditWrite(audit *service.AuditService) gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if method != "POST" && method != "PUT" && method != "DELETE" {
			c.Next()
			return
		}
		// 跳过无业务意义的路径
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/health") ||
			strings.HasPrefix(path, "/api/agent") ||
			strings.Contains(path, "/console") ||
			strings.Contains(path, "/logs") {
			c.Next()
			return
		}

		// 读取请求体副本(供 detail 摘要)
		var reqBody []byte
		if c.Request.Body != nil {
			reqBody, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewBuffer(reqBody))
		}

		bw := &bodyWriter{ResponseWriter: c.Writer}
		c.Writer = bw
		start := time.Now()
		c.Next()

		// 仅记录成功写操作
		if c.Writer.Status() >= 400 {
			return
		}
		// 解析业务 code;创建时从 data.id 补 target_id
		var resp struct {
			Code int `json:"code"`
			Data struct {
				ID uint `json:"id"`
			} `json:"data"`
		}
		_ = json.Unmarshal(bw.buf.Bytes(), &resp)
		if resp.Code != 0 {
			return
		}

		action, targetType, targetID := classifyAPI(method, path, c)
		if targetID == 0 && resp.Data.ID > 0 {
			targetID = resp.Data.ID
		}
		detail := map[string]any{
			"method":   method,
			"path":     path,
			"query":    c.Request.URL.RawQuery,
			"status":   c.Writer.Status(),
			"duration": time.Since(start).String(),
		}
		// 请求体摘要(截断,脱敏密码类字段不处理——单机版无登录)
		if len(reqBody) > 0 && len(reqBody) < 2048 && !strings.Contains(c.ContentType(), "multipart") {
			var raw any
			if json.Unmarshal(reqBody, &raw) == nil {
				detail["body"] = raw
			} else {
				detail["body"] = string(reqBody)
			}
		} else if strings.Contains(c.ContentType(), "multipart") {
			detail["body"] = "(multipart upload)"
		}

		operator := c.GetHeader("X-Operator")
		if operator == "" {
			if op, ok := c.Get("operator"); ok {
				if s, ok2 := op.(string); ok2 && s != "" {
					operator = s
				}
			}
		}
		if operator == "" {
			operator = "system"
		}
		audit.WriteJSON(action, targetType, targetID, operator, detail)
	}
}

// classifyAPI 从路径推断 action / target_type / target_id。
func classifyAPI(method, path string, c *gin.Context) (action, targetType string, targetID uint) {
	// /api/services/1/start → action=start target=service id=1
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// ["api", "services", "1", "start"] or ["api", "runtimes"]
	if len(parts) < 2 {
		return method + " " + path, "unknown", 0
	}
	resource := parts[1] // services / runtimes / ...
	targetType = strings.TrimSuffix(resource, "s")
	if resource == "services" {
		targetType = "service"
	}
	if resource == "runtimes" {
		targetType = "runtime"
	}
	if resource == "audit-logs" {
		targetType = "audit"
	}

	if len(parts) >= 3 {
		if id, err := strconv.ParseUint(parts[2], 10, 64); err == nil {
			targetID = uint(id)
		}
	}
	// 动作名
	if len(parts) >= 4 {
		action = parts[3] // start/stop/install/...
	} else {
		switch method {
		case "POST":
			action = "create"
		case "PUT":
			action = "update"
		case "DELETE":
			action = "delete"
		default:
			action = method
		}
	}
	// 特殊: POST /api/services/1/artifacts → create_artifact
	if len(parts) >= 4 && parts[3] == "artifacts" {
		if method == "POST" {
			action = "upload_artifact"
		} else if method == "DELETE" {
			action = "delete_artifact"
		}
	}
	return action, targetType, targetID
}
