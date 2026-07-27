package model

import "time"

// ServiceType 服务类型,决定启动方式。
type ServiceType string

const (
	ServiceTypeJar   ServiceType = "jar"   // java -jar(依赖 JDK)
	ServiceTypeExe   ServiceType = "exe"   // 直接执行可执行程序
	ServiceTypeBat   ServiceType = "bat"   // cmd /c
	ServiceTypeSh    ServiceType = "sh"    // bash(Git Bash)
	ServiceTypePs1   ServiceType = "ps1"   // powershell -File
)

// ServiceStatus 服务运行状态。
type ServiceStatus string

const (
	StatusCreated  ServiceStatus = "created"  // 已创建,尚未安装
	StatusStopped  ServiceStatus = "stopped"  // 已停止
	StatusRunning  ServiceStatus = "running"  // 运行中
	StatusStopping ServiceStatus = "stopping" // 停止中
	StatusCrashed  ServiceStatus = "crashed"  // 异常退出
	StatusRemoved  ServiceStatus = "removed"  // 已卸载
)

// Service 一个被管理的服务进程单元。
//
// 字段说明:
//   - Code:        业务编码,唯一,用于目录命名与日志检索
//   - Type:        启动类型(jar/exe/bat/sh/ps1)
//   - Status:      运行状态(M2 起 ProcessManager 维护)
//   - PID:         子进程 PID(运行态);由 ProcessManager 落库
//   - RuntimeID:   绑定的运行环境(jar 必填)
//   - TemplateID:  依据的服务模板(可空)
//   - NodeID:      所属节点(单机版恒为 local 节点 id)
type Service struct {
	Base
	Code           string        `gorm:"uniqueIndex;size:64;not null" json:"code"`
	Name           string        `gorm:"size:128;not null" json:"name"`
	Type           ServiceType   `gorm:"size:32;index;not null;default:'jar'" json:"type"`
	Description    string        `gorm:"type:text" json:"description"`
	Status         ServiceStatus `gorm:"size:32;index;not null;default:'created'" json:"status"`
	PID            int           `gorm:"column:pid;default:0" json:"pid"`
	CurrentVersion string        `gorm:"size:64" json:"current_version"`

	WorkDir    string `gorm:"size:512" json:"work_dir"`    // 工作目录
	InstallDir string `gorm:"size:512" json:"install_dir"` // 安装目录
	LogDir     string `gorm:"size:512" json:"log_dir"`     // 日志目录

	RuntimeID  *uint  `gorm:"index" json:"runtime_id"`
	TemplateID *uint  `gorm:"index" json:"template_id"`
	NodeID     uint   `gorm:"index;not null;default:1" json:"node_id"`

	StartedAt *time.Time `json:"started_at"`
}

// ServiceConfig 服务运行配置(1:N,支持版本快照)。
// is_current=true 的那条为当前生效配置。
type ServiceConfig struct {
	Base
	ServiceID      uint   `gorm:"index;not null" json:"service_id"`
	IsCurrent      bool   `gorm:"not null;default:false" json:"is_current"`
	Command        string `gorm:"type:text" json:"command"`        // 可执行命令(jar 时由 type+runtime 推导,可覆盖)
	Args           string `gorm:"type:text" json:"args"`           // 程序参数(空格分隔或 JSON)
	JVMArgs        string `gorm:"type:text" json:"jvm_args"`       // JVM 参数(jar 专用)
	EnvVars        string `gorm:"type:text" json:"env_vars"`       // 环境变量,JSON 字符串
	Port           int    `gorm:"default:0" json:"port"`           // 服务端口(可选)
	HealthCheck    string `gorm:"type:text" json:"health_check"`   // 健康检查配置,JSON 字符串
	AutoRestart    bool   `gorm:"not null;default:false" json:"auto_restart"`
	MaxRestarts    int    `gorm:"default:3" json:"max_restarts"`
	ShutdownTimeout int   `gorm:"default:30" json:"shutdown_timeout"` // 优雅停止超时(秒)
}

// Artifact 制品:一个可安装的版本包。
type Artifact struct {
	Base
	ServiceID  uint   `gorm:"index;not null" json:"service_id"`
	Version    string `gorm:"size:64;not null" json:"version"`
	Filename   string `gorm:"size:256;not null" json:"filename"`
	StoragePath string `gorm:"size:512" json:"storage_path"`
	Source     string `gorm:"size:32;default:'upload'" json:"source"` // upload/url/local
	Checksum   string `gorm:"size:128" json:"checksum"`
	Size       int64  `gorm:"default:0" json:"size"`
	IsCurrent  bool   `gorm:"not null;default:false" json:"is_current"`
	Description string `gorm:"type:text" json:"description"`
}

// Template 服务模板:一类服务的安装配方。
type Template struct {
	Base
	Name             string `gorm:"uniqueIndex;size:128;not null" json:"name"`
	Type             ServiceType `gorm:"size:32;not null;default:'jar'" json:"type"`
	Description      string `gorm:"type:text" json:"description"`
	InstallSteps     string `gorm:"type:text" json:"install_steps"`     // 安装步骤,JSON
	ConfigTemplate   string `gorm:"type:text" json:"config_template"`   // 配置模板,支持变量占位
	DefaultRuntimeID *uint  `gorm:"index" json:"default_runtime_id"`
}
