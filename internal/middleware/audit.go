// Package middleware 提供 HTTP 中间件。
package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/service"
)

const auditBodyLimit = 2048

var sensitiveAuditKeys = map[string]struct{}{
	"password": {}, "passwd": {}, "pass": {}, "token": {}, "agent_token": {},
	"secret": {}, "api_key": {}, "apikey": {}, "access_key": {}, "private_key": {},
	"authorization": {}, "cookie": {}, "set-cookie": {},
}

var sensitiveAuditPayloads = map[string]struct{}{
	"env_vars": {}, "env_template": {}, "extra_headers": {}, "config_template": {},
	"install_steps": {}, "vars": {}, "args": {}, "jvm_args": {},
}

const redactedAuditValue = "[REDACTED]"

// bodyWriter 捕获响应体(仅用于解析 code,不改写响应)。
type bodyWriter struct {
	gin.ResponseWriter
	buf bytes.Buffer
}

func (w *bodyWriter) Write(b []byte) (int, error) {
	w.buf.Write(b)
	return w.ResponseWriter.Write(b)
}

// readAuditBody reads only a bounded prefix while restoring the complete body.
func readAuditBody(body io.ReadCloser) (prefix []byte, restored io.ReadCloser, truncated bool, err error) {
	read := make([]byte, auditBodyLimit+1)
	n, readErr := io.ReadFull(body, read)
	read = read[:n]
	truncated = n > auditBodyLimit
	if truncated {
		prefix = read[:auditBodyLimit]
	} else {
		prefix = read
	}
	restored = io.NopCloser(io.MultiReader(bytes.NewReader(read), body))
	if readErr != nil && readErr != io.ErrUnexpectedEOF && readErr != io.EOF {
		err = readErr
	}
	return prefix, restored, truncated, err
}

func sanitizeAuditQuery(rawQuery string) string {
	values, _ := url.ParseQuery(rawQuery)
	if values == nil {
		return ""
	}
	for key := range values {
		if isSensitiveAuditKey(key) {
			values.Set(key, redactedAuditValue)
		}
	}
	return values.Encode()
}

func sanitizeAuditBody(raw []byte) (any, bool) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return string(raw), false
	}
	return sanitizeAuditValue("", value), true
}

func sanitizeAuditValue(key string, value any) any {
	if isSensitiveAuditKey(key) {
		return redactedAuditValue
	}
	if _, ok := sensitiveAuditPayloads[strings.ToLower(key)]; ok {
		return redactedAuditValue
	}
	switch v := value.(type) {
	case map[string]any:
		for k, child := range v {
			v[k] = sanitizeAuditValue(k, child)
		}
	case []any:
		for i, child := range v {
			v[i] = sanitizeAuditValue("", child)
		}
	}
	return value
}

func isSensitiveAuditKey(key string) bool {
	_, ok := sensitiveAuditKeys[strings.ToLower(strings.TrimSpace(key))]
	return ok
}

func isJSONContentType(contentType string) bool {
	return strings.Contains(contentType, "application/json") || strings.HasSuffix(contentType, "+json")
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

		// 读取有限的请求体副本,并把完整原始流恢复给下游。
		var reqBody []byte
		bodyTruncated := false
		if c.Request.Body != nil && !strings.Contains(strings.ToLower(c.ContentType()), "multipart") {
			var err error
			reqBody, c.Request.Body, bodyTruncated, err = readAuditBody(c.Request.Body)
			if err != nil {
				reqBody = nil
				bodyTruncated = false
			}
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
			"query":    sanitizeAuditQuery(c.Request.URL.RawQuery),
			"status":   c.Writer.Status(),
			"duration": time.Since(start).String(),
		}
		if bodyTruncated {
			detail["body_truncated"] = true
		}
		contentType := strings.ToLower(c.ContentType())
		if len(reqBody) > 0 && !bodyTruncated && isJSONContentType(contentType) {
			if raw, ok := sanitizeAuditBody(reqBody); ok {
				detail["body"] = raw
			} else {
				detail["body"] = "(request body omitted: invalid JSON)"
			}
		} else if strings.Contains(contentType, "multipart") {
			detail["body"] = "(multipart upload)"
		} else if len(reqBody) > 0 && !bodyTruncated {
			detail["body"] = "(request body omitted)"
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
