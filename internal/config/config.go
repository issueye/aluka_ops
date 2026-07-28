// Package config 负责加载应用运行配置。
//
// Aluka Ops 既可作为独立的面板运行(standalone),
// 也可在未来作为 Agent 被中心 Controller 纳管(agent)。
// 运行模式由 ALUKA_MODE 控制,影响是否启用 Agent 上报循环。
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Mode 运行模式:standalone(默认)或 agent(预留)。
type Mode string

const (
	ModeStandalone Mode = "standalone" // 独立面板模式
	ModeAgent      Mode = "agent"      // Agent 模式:向中心上报心跳
	ModeController Mode = "controller" // 中心模式:接收 Agent 心跳并远程管控
)

// Config 应用配置。
type Config struct {
	HTTPPort    int    // HTTP 监听端口
	DataDir     string // 运行数据根目录(sqlite、制品、日志)
	DBPath      string // SQLite 数据库文件路径
	Mode        Mode   // 运行模式
	AllowOrigin string // CORS 允许来源(开发期跨域)
	// AuthPassword 管理密码;为空则关闭鉴权(兼容内网裸奔)。
	// 设置后所有 /api/*(除 /api/health 与 /api/auth/login)需 Bearer Token。
	AuthPassword string
	// AuthTokenTTLHours Token 有效期(小时),默认 24。
	AuthTokenTTLHours int

	// Agent 相关(mode=agent 时向中心 Controller 上报心跳)
	AgentID       string // 本 Agent 唯一标识,默认主机名
	ControllerURL string // 中心 Controller 根地址,如 http://ctrl:19090
	AgentToken    string // Agent 与 Controller 共享密钥(上报与 /api/agent 访问)
	HeartbeatSec  int    // 心跳间隔秒,默认 15
	// AdvertiseURL Agent 对外可访问的 API 根地址(供 Controller 回连),如 http://10.0.0.2:18080
	AdvertiseURL string
	// OfflineAfterSec Controller 判定 Agent 离线的秒数,默认 45(约 3 次心跳)
	OfflineAfterSec int
}

// Default 返回默认配置。
func Default() *Config {
	dataDir := envOr("ALUKA_DATA_DIR", "./data")
	host, _ := os.Hostname()
	if host == "" {
		host = "local"
	}
	return &Config{
		HTTPPort:          envIntOr("ALUKA_PORT", 18080),
		DataDir:           dataDir,
		DBPath:            filepath.Join(dataDir, "aluka_ops.db"),
		Mode:              Mode(envOr("ALUKA_MODE", string(ModeStandalone))),
		AllowOrigin:       envOr("ALUKA_ALLOW_ORIGIN", "*"),
		AuthPassword:      envOr("ALUKA_PASSWORD", ""),
		AuthTokenTTLHours: envIntOr("ALUKA_TOKEN_TTL_HOURS", 24),
		AgentID:          envOr("ALUKA_AGENT_ID", host),
		ControllerURL:    strings.TrimRight(envOr("ALUKA_CONTROLLER_URL", ""), "/"),
		AgentToken:       envOr("ALUKA_AGENT_TOKEN", ""),
		HeartbeatSec:     envIntOr("ALUKA_HEARTBEAT_SEC", 15),
		AdvertiseURL:     strings.TrimRight(envOr("ALUKA_ADVERTISE_URL", ""), "/"),
		OfflineAfterSec:  envIntOr("ALUKA_OFFLINE_AFTER_SEC", 45),
	}
}

// AuthEnabled 是否启用登录鉴权。
func (c *Config) AuthEnabled() bool {
	return c != nil && strings.TrimSpace(c.AuthPassword) != ""
}

// IsAgentMode 是否 Agent 模式。
func (c *Config) IsAgentMode() bool {
	return c != nil && c.Mode == ModeAgent
}

// IsControllerMode 是否中心 Controller 模式。
func (c *Config) IsControllerMode() bool {
	return c != nil && c.Mode == ModeController
}

// HeartbeatEnabled 是否启用向 Controller 上报心跳。
func (c *Config) HeartbeatEnabled() bool {
	return c != nil && c.IsAgentMode() && c.ControllerURL != ""
}

// Load 加载配置并对数据目录进行规范化(转为绝对路径 + 自动创建)。
func Load() (*Config, error) {
	c := Default()
	abs, err := filepath.Abs(c.DataDir)
	if err != nil {
		return nil, fmt.Errorf("解析数据目录绝对路径失败: %w", err)
	}
	c.DataDir = abs
	c.DBPath = filepath.Join(abs, "aluka_ops.db")

	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据目录失败: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(abs, "artifacts"), 0o755); err != nil {
		return nil, fmt.Errorf("创建制品目录失败: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(abs, "logs"), 0o755); err != nil {
		return nil, fmt.Errorf("创建日志目录失败: %w", err)
	}
	return c, nil
}

// HTTPAddr 返回 HTTP 监听地址。
func (c *Config) HTTPAddr() string { return fmt.Sprintf(":%d", c.HTTPPort) }

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envIntOr(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
