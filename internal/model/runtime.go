package model

// RuntimeType 运行环境类型。
type RuntimeType string

const (
	RuntimeTypeJDK    RuntimeType = "jdk"    // Java 运行环境
	RuntimeTypeNode   RuntimeType = "node"   // Node.js(预留)
	RuntimeTypePython RuntimeType = "python" // Python(预留)
	RuntimeTypeGo     RuntimeType = "go"     // Go(预留)
)

// Runtime 一套可复用的运行环境,如 JDK 8/11/17/21。
// 服务(Service)通过 runtime_id 绑定到某个 Runtime,
// 启动子进程时由 ProcessManager 将其 env_template 注入子进程环境变量
// (典型:JAVA_HOME、PATH 前置)。
type Runtime struct {
	Base
	Name         string      `gorm:"uniqueIndex;size:128;not null" json:"name"`             // 名称,唯一(如 "JDK 17")
	Type         RuntimeType `gorm:"size:32;index;not null;default:'jdk'" json:"type"`        // 环境类型
	Version      string      `gorm:"size:64" json:"version"`                                   // 版本(如 "17.0.9")
	InstallPath  string      `gorm:"size:512" json:"install_path"`                             // 安装路径(如 JAVA_HOME)
	IsDefault    bool        `gorm:"not null;default:false" json:"is_default"`                 // 是否默认环境(同 type 内唯一)
	EnvTemplate  string      `gorm:"type:text" json:"env_template"`                            // 额外环境变量模板,JSON 字符串
	Description  string      `gorm:"type:text" json:"description"`
}
