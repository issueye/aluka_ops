package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSMiddlewareWildcard(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(corsMiddleware("*"))
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://unexpected.example")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("allow-origin = %q", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "" {
		t.Fatalf("wildcard credentials = %q", got)
	}
}

func TestCORSMiddlewareFixedOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(corsMiddleware("https://console.example"))
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	for _, tc := range []struct {
		name        string
		origin      string
		allow       string
		credentials string
	}{
		{name: "allowed", origin: "https://console.example", allow: "https://console.example", credentials: "true"},
		{name: "rejected", origin: "https://evil.example"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if got := w.Header().Get("Access-Control-Allow-Origin"); got != tc.allow {
				t.Fatalf("allow-origin = %q, want %q", got, tc.allow)
			}
			if got := w.Header().Get("Access-Control-Allow-Credentials"); got != tc.credentials {
				t.Fatalf("credentials = %q, want %q", got, tc.credentials)
			}
		})
	}
}

func TestCORSMiddlewarePreflightAndAgentHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	called := false
	r.Use(corsMiddleware("https://console.example"))
	r.OPTIONS("/", func(c *gin.Context) { called = true })
	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	req.Header.Set("Origin", "https://console.example")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent || called {
		t.Fatalf("preflight status=%d called=%v", w.Code, called)
	}
	if got := w.Header().Get("Access-Control-Allow-Headers"); got == "" || !containsHeader(got, "X-Agent-Token") {
		t.Fatalf("agent header missing: %q", got)
	}
}

func containsHeader(headers, target string) bool {
	for _, header := range strings.Split(headers, ",") {
		if strings.EqualFold(strings.TrimSpace(header), target) {
			return true
		}
	}
	return false
}
