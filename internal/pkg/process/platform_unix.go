//go:build !windows

package process

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

// setSysProcAttr 为 Unix 子进程设置独立进程组(Setpgid),
// 便于后续用 kill(-pgid) 终止整组。
func setSysProcAttr(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
}

// gracefulStop 优雅停止:向进程组发送 SIGTERM。
func gracefulStop(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return fmt.Errorf("无进程句柄")
	}
	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err != nil {
		// 回退:只给主进程发信号
		return cmd.Process.Signal(syscall.SIGTERM)
	}
	return syscall.Kill(-pgid, syscall.SIGTERM)
}

// killProcessTree 强杀整个进程组。
func killProcessTree(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("PID 无效: %d", pid)
	}
	if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil {
		return syscall.Kill(pid, syscall.SIGKILL)
	}
	return nil
}

// waitForExit 轮询 PID 是否存活,最多等待 timeout。
func waitForExit(pid int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !pidAlive(pid) {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("等待超时")
}

// pidAlive 用 signal 0 探测进程是否存在(0 信号不实际发信号,仅做存在性检查)。
func pidAlive(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// signal 0:成功表示进程存在;ESRCH 表示不存在。
	if err := proc.Signal(syscall.Signal(0)); err == nil {
		return true
	}
	return false
}
