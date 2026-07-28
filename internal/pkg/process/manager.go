package process

import (
	"errors"
	"fmt"
	"io"
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

	// 控制台 stdin:保留管道,供后续 WriteStdin 向进程写入。
	stdin, err := cmd.StdinPipe()
	if err != nil {
		if logFile != nil {
			logFile.Close()
		}
		return nil, fmt.Errorf("创建 stdin 管道失败: %w", err)
	}

	// 平台特定的进程属性(独立进程组)。
	setSysProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		if logFile != nil {
			logFile.Close()
		}
		return nil, fmt.Errorf("启动进程失败: %w", err)
	}

	pid := cmd.Process.Pid

	// 异步等待进程退出,关闭日志/stdin 并从内存移除。
	// 若非主动 Stop,触发 onExit 回调(供自动拉起等逻辑)。
	go func() {
		waitErr := cmd.Wait()
		_ = stdin.Close()
		if logFile != nil {
			logFile.Close()
		}
		m.mu.Lock()
		if cur, ok := m.procs[opts.ServiceID]; ok && cur.PID == pid {
			delete(m.procs, opts.ServiceID)
		}
		intentional := m.intentionalStop[opts.ServiceID]
		delete(m.intentionalStop, opts.ServiceID)
		handler := m.onExit
		m.mu.Unlock()

		if !intentional && handler != nil {
			// 意外退出:回调业务层(崩溃检测 / 自动拉起)
			go handler(opts.ServiceID, pid, waitErr)
		}
	}()

	info := &ProcessInfo{
		ServiceID: opts.ServiceID,
		PID:       pid,
		Cmd:       cmd,
		LogPath:   opts.LogFile,
		Stdin:     stdin,
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
// 标记为 intentional,避免 Wait 回调误判为崩溃。
func (m *Manager) Stop(serviceID uint, pid int, shutdownTimeoutSec int) error {
	m.mu.Lock()
	m.intentionalStop[serviceID] = true
	info, ok := m.procs[serviceID]
	m.mu.Unlock()
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

// WriteStdin 向运行中进程的 stdin 写入数据(控制台输入)。
// 若进程未在本 Manager 管理(如后端重启后)或 stdin 不可用,返回 ErrNoStdin。
// 注意:不在持锁时阻塞写,避免进程不读 stdin 时卡死 Manager。
func (m *Manager) WriteStdin(serviceID uint, data []byte) error {
	if len(data) == 0 {
		return nil
	}
	m.mu.RLock()
	info, ok := m.procs[serviceID]
	var w io.WriteCloser
	if ok && info != nil {
		w = info.Stdin
	}
	m.mu.RUnlock()
	if w == nil {
		return ErrNoStdin
	}
	_, err := w.Write(data)
	if err != nil {
		if errors.Is(err, io.ErrClosedPipe) || errors.Is(err, os.ErrClosed) {
			return ErrNoStdin
		}
		return fmt.Errorf("写入 stdin 失败: %w", err)
	}
	return nil
}

// ErrAlreadyRunning 服务已有运行中进程。
var ErrAlreadyRunning = errors.New("服务已在运行")

// ErrNoStdin 进程未运行或 stdin 不可用(后端重启后内存映射丢失也会触发)。
var ErrNoStdin = errors.New("进程未运行或控制台不可用,请先在本实例启动服务")

var _ = sync.Mutex{} // 保留 sync 引用(platform_* 可能用到)
