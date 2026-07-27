package model

import "time"

// OpType 操作类型。
type OpType string

const (
	OpInstall   OpType = "install"
	OpStart     OpType = "start"
	OpStop      OpType = "stop"
	OpRestart   OpType = "restart"
	OpUpgrade   OpType = "upgrade"
	OpUninstall OpType = "uninstall"
)

// OpStatus 操作状态。
type OpStatus string

const (
	OpPending OpStatus = "pending"
	OpRunning OpStatus = "running"
	OpSuccess OpStatus = "success"
	OpFailed  OpStatus = "failed"
)

// Operation 一次对服务的操作记录。
type Operation struct {
	Base
	ServiceID   uint      `gorm:"index;not null" json:"service_id"`
	Type        OpType    `gorm:"size:32;index;not null" json:"type"`
	Status      OpStatus  `gorm:"size:32;index;not null;default:'pending'" json:"status"`
	TriggeredBy string    `gorm:"size:64" json:"triggered_by"`
	Detail      string    `gorm:"type:text" json:"detail"`     // 输入参数摘要
	OutputLog   string    `gorm:"type:text" json:"output_log"` // 执行输出
	StartedAt   *time.Time `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
	ErrorMsg    string    `gorm:"type:text" json:"error_msg"`
}

// AuditLog 审计日志:所有写操作的留痕。
type AuditLog struct {
	Base
	Action     string `gorm:"size:64;index;not null" json:"action"`
	TargetType string `gorm:"size:32;index" json:"target_type"`
	TargetID   uint   `gorm:"index" json:"target_id"`
	Operator   string `gorm:"size:64" json:"operator"`
	Detail     string `gorm:"type:text" json:"detail"`
}

// Setting 全局键值设置。
type Setting struct {
	Key       string `gorm:"primaryKey;size:128" json:"key"`
	Value     string `gorm:"type:text" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}
