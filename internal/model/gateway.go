package model

// GatewayRuleType 网关规则类型。
type GatewayRuleType string

const (
	GatewayTypeStatic GatewayRuleType = "static" // 静态站点
	GatewayTypeProxy  GatewayRuleType = "proxy"  // 反向代理
	GatewayTypeScript GatewayRuleType = "script" // 路由脚本(rewrite/redirect/proxy/static/deny)
)

// GatewayRule 网关路由规则:监听端口 + 路径前缀 → 静态目录或上游。
//
// 同一 ListenPort 可挂多条规则,按 PathPrefix 最长匹配分流。
// 启用时动态 Listen;该端口下无启用规则时关闭监听。
type GatewayRule struct {
	Base
	Name        string          `gorm:"size:128;not null" json:"name"`
	Code        string          `gorm:"uniqueIndex;size:64;not null" json:"code"`
	Type        GatewayRuleType `gorm:"size:16;index;not null" json:"type"` // static | proxy
	Enabled     bool            `gorm:"not null;default:false;index" json:"enabled"`
	ListenPort  int             `gorm:"not null;index" json:"listen_port"`
	// PathPrefix 路径前缀,如 /app 或 /;空视为 /
	PathPrefix string `gorm:"size:256;not null;default:'/'" json:"path_prefix"`
	// StripPrefix 转发/取静态文件前是否去掉 PathPrefix
	StripPrefix bool `gorm:"not null;default:true" json:"strip_prefix"`

	// ===== static =====
	// RootDir 静态根目录(绝对路径或相对 data 的路径)
	RootDir    string `gorm:"size:512" json:"root_dir"`
	SPAFallback bool  `gorm:"not null;default:true" json:"spa_fallback"` // 无文件时回退 index.html

	// ===== proxy =====
	// Upstream 上游地址,如 http://127.0.0.1:8080
	Upstream string `gorm:"size:512" json:"upstream"`
	// 超时(秒);0 表示使用代码内默认(连接 10s / 响应头 60s)
	ConnectTimeoutSec int `gorm:"not null;default:10" json:"connect_timeout_sec"`
	// 响应头读超时;上传场景可加大
	ResponseHeaderTimeoutSec int `gorm:"not null;default:60" json:"response_header_timeout_sec"`
	// 整体请求上下文超时(秒);0=不限制(大文件上传推荐 0,勿写成默认 600)
	IOTimeoutSec int `gorm:"not null;default:0" json:"io_timeout_sec"`
	// MaxBodyBytes 请求体上限;0=不限制(上传场景推荐 0)
	MaxBodyBytes int64 `gorm:"not null;default:0" json:"max_body_bytes"`
	// 是否透传 Host;默认 false(Host 用上游 host)
	PassHost bool `gorm:"not null;default:false" json:"pass_host"`
	// 附加请求头 JSON map,如 {"X-From":"aluka"}
	ExtraHeaders string `gorm:"type:text" json:"extra_headers"`
	// WebSocket 升级透传
	EnableWebSocket bool `gorm:"not null;default:true" json:"enable_websocket"`

	Description string `gorm:"type:text" json:"description"`
	// Sort 同端口内匹配顺序,数值越小越先;实际用最长前缀优先,Sort 作并列时次序
	Sort int `gorm:"default:0" json:"sort"`
}
