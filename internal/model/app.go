package model

// GatewayPort 可动态监听的代理端口。
// 其下可挂: APP(静态前端) + ProxyRule(反代) + RouteScript(路由脚本)。
// 端口启用且存在启用中的 APP/反代/脚本时才 Listen。
type GatewayPort struct {
	Base
	Port        int    `gorm:"uniqueIndex;not null" json:"port"`
	Name        string `gorm:"size:128;not null" json:"name"`
	Enabled     bool   `gorm:"not null;default:true;index" json:"enabled"`
	Description string `gorm:"type:text" json:"description"`

	// 关联(查询时 Preload)
	Apps    []App             `gorm:"foreignKey:PortID" json:"apps,omitempty"`
	Proxies []PortProxyRule   `gorm:"foreignKey:PortID" json:"proxies,omitempty"`
	Scripts []PortRouteScript `gorm:"foreignKey:PortID" json:"scripts,omitempty"`
}

// App 前端应用(静态站点)。
// 绑定代理端口 + 路径前缀 + 静态目录;不包含反代(反代在端口下独立管理)。
type App struct {
	Base
	Code        string `gorm:"uniqueIndex;size:64;not null" json:"code"`
	Name        string `gorm:"size:128;not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	Enabled     bool   `gorm:"not null;default:true;index" json:"enabled"`

	// PortID 绑定的代理端口
	PortID uint `gorm:"index;not null" json:"port_id"`
	// PathPrefix 应用挂载路径,如 / 或 /admin
	PathPrefix string `gorm:"size:256;not null;default:'/'" json:"path_prefix"`
	// StripPrefix 取静态文件时是否去掉 PathPrefix
	StripPrefix bool `gorm:"not null;default:true" json:"strip_prefix"`
	// RootDir 静态根目录;空则默认 data/apps/<code>
	RootDir string `gorm:"size:512" json:"root_dir"`
	// SPAFallback 找不到文件时回退 index.html
	SPAFallback bool `gorm:"not null;default:true" json:"spa_fallback"`

	Port *GatewayPort `gorm:"foreignKey:PortID" json:"port,omitempty"`
}

// PortProxyRule 挂在代理端口下的反向代理规则。
// 与 APP 平级:同端口内按 path_prefix 最长匹配,反代优先于静态(前缀更具体时)。
type PortProxyRule struct {
	Base
	PortID      uint   `gorm:"index;not null" json:"port_id"`
	Name        string `gorm:"size:128;not null" json:"name"`
	Code        string `gorm:"uniqueIndex;size:64;not null" json:"code"`
	Enabled     bool   `gorm:"not null;default:true;index" json:"enabled"`
	// PathPrefix 在端口上的路径前缀,如 /api
	PathPrefix  string `gorm:"size:256;not null" json:"path_prefix"`
	StripPrefix bool   `gorm:"not null;default:true" json:"strip_prefix"`

	Upstream                 string `gorm:"size:512;not null" json:"upstream"`
	ConnectTimeoutSec        int    `gorm:"not null;default:10" json:"connect_timeout_sec"`
	ResponseHeaderTimeoutSec int    `gorm:"not null;default:60" json:"response_header_timeout_sec"`
	// IOTimeoutSec 0=不限制(大文件上传推荐)
	IOTimeoutSec    int    `gorm:"not null;default:0" json:"io_timeout_sec"`
	MaxBodyBytes    int64  `gorm:"not null;default:0" json:"max_body_bytes"`
	PassHost        bool   `gorm:"not null;default:false" json:"pass_host"`
	EnableWebSocket bool   `gorm:"not null;default:true" json:"enable_websocket"`
		ExtraHeaders    string `gorm:"type:text" json:"extra_headers"`
		Sort            int    `gorm:"default:0" json:"sort"`
		Description     string `gorm:"type:text" json:"description"`

		Port *GatewayPort `gorm:"foreignKey:PortID" json:"port,omitempty"`
	}

	// PortRouteScript 挂在代理端口下的路由脚本规则。
	// 在静态/反代匹配前执行,支持路径改写、重定向、拒绝、或脚本内指定 proxy/static。
	//
	// Script 为 JSON 数组,按顺序执行,例如:
	//
	//	[
	//	  {"when":{"path_regex":"^/old/(.*)$"},"then":{"rewrite":"/new/$1"}},
	//	  {"when":{"path_prefix":"/admin"},"then":{"redirect":"/login","status":302}},
	//	  {"when":{"path_prefix":"/blocked"},"then":{"deny":403,"body":"forbidden"}},
	//	  {"when":{"path_regex":"^/v1/(.*)$"},"then":{"proxy":"http://127.0.0.1:8080","strip_prefix":"/v1"}},
	//	  {"when":{"path_prefix":"/docs"},"then":{"static":"apps/docs","spa":true}}
	//	]
	//
	// when 可选: method, path_prefix, path_exact, path_regex, header(map)
	// then: deny > redirect > rewrite(改 path 后 continue) > proxy > static > break
	type PortRouteScript struct {
		Base
		PortID   uint   `gorm:"index;not null" json:"port_id"`
		Name     string `gorm:"size:128;not null" json:"name"`
		Code     string `gorm:"uniqueIndex;size:64;not null" json:"code"`
		Enabled  bool   `gorm:"not null;default:true;index" json:"enabled"`
		// PathPrefix 脚本作用域;仅匹配此前缀的请求才进入脚本(空或 / 表示全端口)
		PathPrefix string `gorm:"size:256;not null;default:'/'" json:"path_prefix"`
		// Priority 越小越先执行(同端口多脚本)
		Priority int `gorm:"not null;default:100;index" json:"priority"`
		// Script JSON 规则数组
		Script      string `gorm:"type:text;not null" json:"script"`
		Description string `gorm:"type:text" json:"description"`

		Port *GatewayPort `gorm:"foreignKey:PortID" json:"port,omitempty"`
	}
