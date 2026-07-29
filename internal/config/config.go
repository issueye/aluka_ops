// Package config 负责加载应用运行配置。
//
// Aluka Ops 既可作为独立的面板运行(standalone),
// 也可在未来作为 Agent 被中心 Controller 纳管(agent)。
// 运行模式由 ALUKA_MODE 控制,影响是否启用 Agent 上报循环。
//
// 配置优先级:命令行参数 > 环境变量 > 默认值。
// 例如: aluka_ops.exe -port 8080
package config

import (
	"flag"
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
	// TrustedProxies 可信反向代理 IP/CIDR 列表;为空时忽略转发头。
	TrustedProxies string
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
		TrustedProxies:    envOr("ALUKA_TRUSTED_PROXIES", ""),
		AuthPassword:      envOr("ALUKA_PASSWORD", ""),
		AuthTokenTTLHours: envIntOr("ALUKA_TOKEN_TTL_HOURS", 24),
		AgentID:           envOr("ALUKA_AGENT_ID", host),
		ControllerURL:     strings.TrimRight(envOr("ALUKA_CONTROLLER_URL", ""), "/"),
		AgentToken:        envOr("ALUKA_AGENT_TOKEN", ""),
		HeartbeatSec:      envIntOr("ALUKA_HEARTBEAT_SEC", 15),
		AdvertiseURL:      strings.TrimRight(envOr("ALUKA_ADVERTISE_URL", ""), "/"),
		OfflineAfterSec:   envIntOr("ALUKA_OFFLINE_AFTER_SEC", 45),
	}
}

// AuthEnabled 是否启用登录鉴权。
func (c *Config) AuthEnabled() bool {
	return c != nil && strings.TrimSpace(c.AuthPassword) != ""
}

// OriginAllowed 判断请求来源是否符合配置。
// 空 Origin 通常来自非浏览器客户端,保留兼容性;固定来源按完整字符串精确匹配。
func OriginAllowed(allowOrigin, origin string) bool {
	allowOrigin = strings.TrimSpace(allowOrigin)
	origin = strings.TrimSpace(origin)
	if origin == "" || allowOrigin == "*" {
		return true
	}
	return origin == allowOrigin
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
// 会解析 os.Args 中的命令行参数(见 applyFlags)。
func Load() (*Config, error) {
	c := Default()
	if err := applyFlags(c, os.Args[1:]); err != nil {
		return nil, err
	}
	if c.HTTPPort <= 0 || c.HTTPPort > 65535 {
		return nil, fmt.Errorf("无效端口: %d(有效范围 1-65535)", c.HTTPPort)
	}

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

// applyFlags 解析命令行参数并覆盖配置。
// 未显式传入的项保持环境变量/默认值。
//
// 支持:
//
//	-port / -p          HTTP 监听端口
//	-data-dir           数据目录
//	-mode               standalone|agent|controller
//	-password           管理密码(启用鉴权)
//	-allow-origin       CORS
//	-controller-url     Agent 中心地址
//	-agent-id           Agent ID
//	-agent-token        Agent 共享密钥
//	-advertise-url      Agent 对外 API 地址
//	-h / -help          打印帮助
func applyFlags(c *Config, args []string) error {
	if c == nil {
		return fmt.Errorf("config is nil")
	}
	fs := flag.NewFlagSet("aluka_ops", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Aluka Ops · 服务治理系统\n\n")
		fmt.Fprintf(os.Stderr, "用法:\n  %s [选项]\n\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "选项:\n")
		fs.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\n环境变量(命令行优先):\n")
		fmt.Fprintf(os.Stderr, "  ALUKA_PORT ALUKA_DATA_DIR ALUKA_MODE ALUKA_PASSWORD ...\n")
		fmt.Fprintf(os.Stderr, "\n示例:\n")
		fmt.Fprintf(os.Stderr, "  %s -port 8080\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "  %s -p 19090 -data-dir D:\\aluka_data\n", os.Args[0])
	}

	port := fs.Int("port", 0, "HTTP 监听端口(默认 18080 或 ALUKA_PORT)")
	portShort := fs.Int("p", 0, "HTTP 监听端口(同 -port)")
	dataDir := fs.String("data-dir", "", "数据目录(默认 ./data 或 ALUKA_DATA_DIR)")
	mode := fs.String("mode", "", "运行模式: standalone|agent|controller")
	password := fs.String("password", "", "管理密码;非空则启用登录鉴权")
	allowOrigin := fs.String("allow-origin", "", "CORS 允许来源(默认 *)")
	controllerURL := fs.String("controller-url", "", "Agent 模式:中心 Controller 根地址")
	agentID := fs.String("agent-id", "", "Agent 唯一标识")
	agentToken := fs.String("agent-token", "", "Agent/Controller 共享密钥")
	advertiseURL := fs.String("advertise-url", "", "Agent 对外可访问的 API 根地址")

	if err := fs.Parse(args); err != nil {
		// flag.ErrHelp 在 -h 时返回,上层应退出 0
		return err
	}

	if *portShort > 0 {
		c.HTTPPort = *portShort
	}
	if *port > 0 {
		c.HTTPPort = *port // -port 覆盖 -p
	}
	if strings.TrimSpace(*dataDir) != "" {
		c.DataDir = strings.TrimSpace(*dataDir)
		c.DBPath = filepath.Join(c.DataDir, "aluka_ops.db")
	}
	if m := strings.TrimSpace(*mode); m != "" {
		c.Mode = Mode(m)
	}
	if p := *password; p != "" {
		c.AuthPassword = p
	}
	if o := strings.TrimSpace(*allowOrigin); o != "" {
		c.AllowOrigin = o
	}
	if u := strings.TrimSpace(*controllerURL); u != "" {
		c.ControllerURL = strings.TrimRight(u, "/")
	}
	if id := strings.TrimSpace(*agentID); id != "" {
		c.AgentID = id
	}
	if t := *agentToken; t != "" {
		c.AgentToken = t
	}
	if u := strings.TrimSpace(*advertiseURL); u != "" {
		c.AdvertiseURL = strings.TrimRight(u, "/")
	}
	return nil
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
