package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSanitizeAuditBody(t *testing.T) {
	body := []byte(`{"Password":"secret","nested":{"token":"abc"},"items":[{"api_key":"key"}],"env_vars":"PASSWORD=secret"}`)
	value, ok := sanitizeAuditBody(body)
	if !ok {
		t.Fatal("expected valid JSON")
	}
	text := toAuditText(value)
	if strings.Contains(text, `"secret"`) || strings.Contains(text, `"abc"`) || strings.Contains(text, `"key"`) {
		t.Fatalf("sensitive value leaked: %s", text)
	}
	if !strings.Contains(text, redactedAuditValue) {
		t.Fatalf("expected redaction marker: %s", text)
	}
}

func TestSanitizeAuditQuery(t *testing.T) {
	got := sanitizeAuditQuery("page=2&token=secret&agent_token=agent&filter=running")
	if strings.Contains(got, "secret") || strings.Contains(got, "agent%5Ftoken") {
		t.Fatalf("sensitive query value leaked: %s", got)
	}
	values, err := url.ParseQuery(got)
	if err != nil {
		t.Fatal(err)
	}
	if values.Get("token") != redactedAuditValue || values.Get("agent_token") != redactedAuditValue {
		t.Fatalf("sensitive query values were not redacted: %s", got)
	}
	if values.Get("page") != "2" || values.Get("filter") != "running" {
		t.Fatalf("ordinary query values were lost: %s", got)
	}
}

func TestReadAuditBodyRestoresFullStream(t *testing.T) {
	input := bytes.Repeat([]byte("x"), auditBodyLimit+32)
	prefix, restored, truncated, err := readAuditBody(io.NopCloser(bytes.NewReader(input)))
	if err != nil {
		t.Fatal(err)
	}
	if !truncated || len(prefix) != auditBodyLimit {
		t.Fatalf("unexpected bounded read: len=%d truncated=%v", len(prefix), truncated)
	}
	full, err := io.ReadAll(restored)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(full, input) {
		t.Fatal("restored body differs from original")
	}
}

func TestAuditWriteRestoresBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(AuditWrite(nil))
	r.POST("/api/services", func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			t.Fatal(err)
		}
		if string(body) != `{"password":"secret"}` {
			t.Fatalf("unexpected body: %s", body)
		}
		c.JSON(200, gin.H{"code": 0, "data": gin.H{"id": 1}})
	})
	req := httptest.NewRequest("POST", "/api/services", strings.NewReader(`{"password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
}

func toAuditText(value any) string {
	b, _ := json.Marshal(value)
	return strings.TrimSpace(string(b))
}
