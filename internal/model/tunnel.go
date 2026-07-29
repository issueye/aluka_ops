package model

// TunnelRule 反向 TCP 隧道规则:中心 listen → Agent 侧 remote。
// mode 首期固定 reverse_tcp。
type TunnelRule struct {
	Base
	Code    string `gorm:"uniqueIndex;size:64;not null" json:"code"`
	Name    string `gorm:"size:128;not null" json:"name"`
	Enabled bool   `gorm:"not null;default:true;index" json:"enabled"`
	// Mode 首期仅 reverse_tcp
	Mode string `gorm:"size:32;not null;default:'reverse_tcp'" json:"mode"`
	// AgentID 目标 Agent 标识(与心跳 agent_id 一致)
	AgentID string `gorm:"size:128;not null;index" json:"agent_id"`
	// ListenHost 中心监听地址,空则 0.0.0.0
	ListenHost string `gorm:"size:128;not null;default:''" json:"listen_host"`
	// ListenPort 中心对外端口(全局唯一)
	ListenPort int `gorm:"uniqueIndex;not null" json:"listen_port"`
	// RemoteHost Agent 侧拨号目标,默认 127.0.0.1
	RemoteHost string `gorm:"size:256;not null;default:'127.0.0.1'" json:"remote_host"`
	RemotePort int    `gorm:"not null" json:"remote_port"`
	// MaxConns 单规则最大并发,0=不限(内部仍有全局软上限)
	MaxConns int `gorm:"not null;default:64" json:"max_conns"`
	// IdleTimeoutSec 单连接空闲超时,0=不限制
	IdleTimeoutSec int    `gorm:"not null;default:0" json:"idle_timeout_sec"`
	Description    string `gorm:"type:text" json:"description"`
}

// TunnelModeReverseTCP 中心监听,流量经隧道到 Agent 本机/内网。
const TunnelModeReverseTCP = "reverse_tcp"
