// Package model 定义 GORM 实体。
//
// 本文件组按 M1 设计稿一次性建表,后续阶段填充业务逻辑时不再变更 schema,
// 以避免 AutoMigrate 带来的迁移抖动。
package model

import "time"

// Base 通用主键与时间戳。
type Base struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Node 被管理的目标机器。
// 单机版默认仅有一个 code=local 的本地节点;
// 多机场景下,远程 Agent 上线后在此表新增记录。
type Node struct {
	Base
	Code        string `gorm:"uniqueIndex;size:64;not null" json:"code"`       // 节点编码(local / agent 标识)
	Name        string `gorm:"size:128" json:"name"`                            // 显示名称
	Host        string `gorm:"size:128" json:"host"`                            // 主机名/IP
	OS          string `gorm:"size:32" json:"os"`                               // 操作系统
	Status      string `gorm:"size:32;default:'online'" json:"status"`         // online/offline
	IsLocal     bool   `gorm:"not null;default:false" json:"is_local"`         // 是否本机节点
	LastSeenAt  *time.Time `json:"last_seen_at"`                                // 最后心跳时间(Agent 模式)
	Description string `gorm:"type:text" json:"description"`
}
