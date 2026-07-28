// Package process 封装跨平台进程管理。
//
// 设计要点:
//   - Manager 为单例,持有所有被拉起的进程句柄(map[serviceID]*ProcessInfo)
//   - 子进程以独立进程组启动,便于整组终止
//   - stdout/stderr 合并重定向到日志文件,便于实时查看与排查
//   - 跨平台差异隔离在 platform_windows.go / platform_unix.go
package process

import (
	"io"
	"os/exec"
	"sync"
)

// StartOptions 启动一个被管进程所需的信息。
//
// 字段说明:
//   - ServiceID:   所属服务 ID(用作 map key)
//   - LogFile:     stdout/stderr 重定向目标文件;为空则丢弃
//   - Name:        可执行程序名(已含路径)
//   - Args:        程序参数
//   - Dir:         工作目录;为空则继承
//   - Env:         完整环境变量(由调用方合并好);为空则继承父进程
//   - ShutdownTimeout: 优雅停止超时秒数,超时后强杀
type StartOptions struct {
	ServiceID       uint
	LogFile         string
	Name            string
	Args            []string
	Dir             string
	Env             []string
	ShutdownTimeout int
}

// ProcessInfo 一个被管进程的运行时信息(内存态)。
type ProcessInfo struct {
	ServiceID uint
	PID       int
	Cmd       *exec.Cmd
	LogPath   string
	// Stdin 进程标准输入管道,供控制台向运行中进程写入。
	// 进程退出后会被关闭,WriteStdin 需判空。
	Stdin io.WriteCloser
}

// ExitHandler 进程意外退出时的回调(非主动 Stop)。
// 在独立 goroutine 中调用,勿阻塞 Wait。
type ExitHandler func(serviceID uint, pid int, waitErr error)

// Manager 进程管理器单例。
type Manager struct {
	mu              sync.RWMutex
	procs           map[uint]*ProcessInfo // serviceID -> info
	stopper         map[uint]chan struct{}
	intentionalStop map[uint]bool // 标记主动停止,避免误触发崩溃回调
	onExit          ExitHandler
}

// NewManager 构造进程管理器。
func NewManager() *Manager {
	return &Manager{
		procs:           make(map[uint]*ProcessInfo),
		stopper:         make(map[uint]chan struct{}),
		intentionalStop: make(map[uint]bool),
	}
}

// SetExitHandler 设置进程意外退出回调。
func (m *Manager) SetExitHandler(h ExitHandler) {
	m.mu.Lock()
	m.onExit = h
	m.mu.Unlock()
}
