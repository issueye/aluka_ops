// Package healthcheck 提供 HTTP/TCP 健康探针。
package healthcheck

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// Type 探针类型。
type Type string

const (
	TypeNone Type = "none"
	TypeHTTP Type = "http"
	TypeTCP  Type = "tcp"
)

// Config 健康检查配置(存 ServiceConfig.HealthCheck JSON)。
type Config struct {
	Type          Type  `json:"type"`                     // none | http | tcp
	Target        string `json:"target"`                  // http URL 或 host:port
	IntervalSec   int   `json:"interval_sec"`             // 探测间隔,默认 10
	TimeoutSec    int   `json:"timeout_sec"`              // 超时,默认 3
	HealthyStatus []int `json:"healthy_status,omitempty"` // HTTP 视为健康的状态码,默认 [200]
}

// Result 一次探测结果。
type Result struct {
	Healthy   bool      `json:"healthy"`
	Checked   bool      `json:"checked"` // 是否已执行过探测
	Message   string    `json:"message"`
	LatencyMs int64     `json:"latency_ms"`
	CheckedAt time.Time `json:"checked_at"`
	Type      Type      `json:"type"`
	Target    string    `json:"target"`
}

// ParseConfig 解析 JSON;空/非法返回 type=none。
func ParseConfig(raw string) Config {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return Config{Type: TypeNone}
	}
	var c Config
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return Config{Type: TypeNone}
	}
	c.Type = Type(strings.ToLower(string(c.Type)))
	if c.Type == "" {
		c.Type = TypeNone
	}
	if c.IntervalSec <= 0 {
		c.IntervalSec = 10
	}
	if c.TimeoutSec <= 0 {
		c.TimeoutSec = 3
	}
	if len(c.HealthyStatus) == 0 {
		c.HealthyStatus = []int{http.StatusOK}
	}
	return c
}

// Enabled 是否启用探针。
func (c Config) Enabled() bool {
	return c.Type == TypeHTTP || c.Type == TypeTCP
}

// Probe 执行一次健康检查。
func Probe(cfg Config) Result {
	now := time.Now()
	if !cfg.Enabled() {
		return Result{
			Healthy:   true,
			Checked:   false,
			Message:   "未配置健康检查",
			CheckedAt: now,
			Type:      TypeNone,
		}
	}
	timeout := time.Duration(cfg.TimeoutSec) * time.Second
	start := time.Now()

	var err error
	switch cfg.Type {
	case TypeHTTP:
		err = probeHTTP(cfg.Target, timeout, cfg.HealthyStatus)
	case TypeTCP:
		err = probeTCP(cfg.Target, timeout)
	default:
		return Result{Healthy: true, Checked: false, Message: "未知探针类型", CheckedAt: now, Type: cfg.Type}
	}

	lat := time.Since(start).Milliseconds()
	if err != nil {
		return Result{
			Healthy:   false,
			Checked:   true,
			Message:   err.Error(),
			LatencyMs: lat,
			CheckedAt: now,
			Type:      cfg.Type,
			Target:    cfg.Target,
		}
	}
	return Result{
		Healthy:   true,
		Checked:   true,
		Message:   "ok",
		LatencyMs: lat,
		CheckedAt: now,
		Type:      cfg.Type,
		Target:    cfg.Target,
	}
}

func probeHTTP(target string, timeout time.Duration, okCodes []int) error {
	target = strings.TrimSpace(target)
	if target == "" {
		return fmt.Errorf("HTTP 探针 target 为空")
	}
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		target = "http://" + target
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	for _, code := range okCodes {
		if resp.StatusCode == code {
			return nil
		}
	}
	return fmt.Errorf("HTTP %d 不在健康状态码列表", resp.StatusCode)
}

func probeTCP(target string, timeout time.Duration) error {
	target = strings.TrimSpace(target)
	if target == "" {
		return fmt.Errorf("TCP 探针 target 为空")
	}
	// 允许 host:port 或 :port
	d := net.Dialer{Timeout: timeout}
	conn, err := d.Dial("tcp", target)
	if err != nil {
		return err
	}
	_ = conn.Close()
	return nil
}
