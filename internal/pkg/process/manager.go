package process

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// 启动一个被管子进程:创建独立进程组 + 重定向输出到日志文件。
// 平台特定的 SysProcAttr 由 setSysProcAttr(cmd) 注入。
func (m *Manager) startProcess(opts StartOptions) (*ProcessInfo, error) {
	if opts.Name == "" {
		return nil, errors.New("可执行程序名不能为空")
	}

	cmd := exec.Command(opts.Name, opts.Args...)
	cmd.Dir = opts.Dir
	if len(opts.Env) > 0 {
		cmd.Env = opts.Env
	}

	// 打开日志文件,stdout/stderr 合并写入。
	var logFile *os.File
	if opts.LogFile != "" {
		if err := os.MkdirAll(filepath.Dir(opts.LogFile), 0o755); err != nil {
			return nil, fmt.Errorf("创建日志目录失败: %w", err)
		}
		f, err := os.OpenFile(opts.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			return nil, fmt.Errorf("打开日志文件失败: %w", err)
		}
		logFile = f
		cmd.Stdout = f
		cmd.Stderr = f
	}

	// 平台特定的进程属性(独立进程组)。
	setSysProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		if logFile != nil {
			logFile.Close()
		}
		return nil, fmt.Errorf("启动进程失败: %w", err)
	}

	pid := cmd.Process.Pid

	// 异步等待进程退出,关闭日志文件并从内存移除。
	// 注意:仅清理内存映射,DB 的状态由业务层按需更新。
	go func() {
		_ = cmd.Wait()
		if logFile != nil {
			logFile.Close()
		}
		m.mu.Lock()
		if cur, ok := m.procs[opts.ServiceID]; ok && cur.PID == pid {
			delete(m.procs, opts.ServiceID)
		}
		m.mu.Unlock()
	}()

	info := &ProcessInfo{
		ServiceID: opts.ServiceID,
		PID:       pid,
		Cmd:       cmd,
		LogPath:   opts.LogFile,
	}
	m.mu.Lock()
	m.procs[opts.ServiceID] = info
	m.mu.Unlock()

	return info, nil
}

// Start 拉起一个进程。若该服务已有运行中进程,返回错误。
func (m *Manager) Start(opts StartOptions) (*ProcessInfo, error) {
	m.mu.RLock()
	_, exists := m.procs[opts.ServiceID]
	m.mu.RUnlock()
	if exists {
		return nil, ErrAlreadyRunning
	}
	return m.startProcess(opts)
}

// Stop 停止进程:先尝试优雅停止,超时后强杀整进程树。
// 返回最终被 kill 的 PID。
func (m *Manager) Stop(serviceID uint, pid int, shutdownTimeoutSec int) error {
	m.mu.RLock()
	info, ok := m.procs[serviceID]
	m.mu.RUnlock()
	if !ok {
		// 内存中无记录:可能是后端重启后的残留进程,直接按 PID 强杀清理。
		return killProcessTree(pid)
	}
	if info.PID != pid {
		return fmt.Errorf("PID 不匹配(内存 %d != 传入 %d),可能进程已重启", info.PID, pid)
	}

	timeout := shutdownTimeoutSec
	if timeout <= 0 {
		timeout = 10
	}

	// 1) 优雅停止
	if err := gracefulStop(info.Cmd); err != nil {
		// 优雅停止失败不致命,继续走强杀
		_ = err
	}

	// 2) 等待退出或超时强杀
	done := make(chan error, 1)
	go func() {
		// 给 cmd.Wait() 一个出口;这里复用 info.Cmd 的 Wait,但主 Wait goroutine 可能已消费。
		// 为避免冲突,改用纯 PID 等待。
		done <- waitForExit(pid, time.Duration(timeout)*time.Second)
	}()

	select {
	case <-done:
		// 已优雅退出
	case <-time.After(time.Duration(timeout) * time.Second):
		// 超时,强杀整树
		if err := killProcessTree(pid); err != nil {
			return fmt.Errorf("强杀失败: %w", err)
		}
	}

	m.mu.Lock()
	delete(m.procs, serviceID)
	m.mu.Unlock()
	return nil
}

// IsAlive 按 PID 探测进程是否存活。
func (m *Manager) IsAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	return pidAlive(pid)
}

// Get 获取内存中的进程信息(可能为空,如后端重启后)。
func (m *Manager) Get(serviceID uint) (*ProcessInfo, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	info, ok := m.procs[serviceID]
	return info, ok
}

// Count 当前内存管理的进程数(诊断用)。
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.procs)
}

// ErrAlreadyRunning 服务已有运行中进程。
var ErrAlreadyRunning = errors.New("服务已在运行")

var _ = sync.Mutex{} // 保留 sync 引用(platform_* 可能用到)
