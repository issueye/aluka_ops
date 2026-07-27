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
)

// Mode 运行模式:standalone(默认)或 agent(预留)。
type Mode string

const (
	ModeStandalone Mode = "standalone" // 独立面板模式
	ModeAgent      Mode = "agent"      // Agent 模式(预留,首版不启用上报循环)
)

// Config 应用配置。
type Config struct {
	HTTPPort   int    // HTTP 监听端口
	DataDir    string // 运行数据根目录(sqlite、制品、日志)
	DBPath     string // SQLite 数据库文件路径
	Mode       Mode   // 运行模式
	AllowOrigin string // CORS 允许来源(开发期跨域)
}

// Default 返回默认配置。
func Default() *Config {
	dataDir := envOr("ALUKA_DATA_DIR", "./data")
	return &Config{
		HTTPPort:    envIntOr("ALUKA_PORT", 18080),
		DataDir:     dataDir,
		DBPath:      filepath.Join(dataDir, "aluka_ops.db"),
		Mode:        Mode(envOr("ALUKA_MODE", string(ModeStandalone))),
		AllowOrigin: envOr("ALUKA_ALLOW_ORIGIN", "*"),
	}
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
