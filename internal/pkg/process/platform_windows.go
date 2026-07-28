//go:build windows

package process

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

// setSysProcAttr 为 Windows 子进程设置独立进程组。
// CREATE_NEW_PROCESS_GROUP 使子进程可接收 Ctrl+Break,
// 并与父进程(console)隔离,避免信号串扰。
func setSysProcAttr(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags = windows.CREATE_NEW_PROCESS_GROUP
	cmd.SysProcAttr.HideWindow = true
}

// gracefulStop 优雅停止:向进程组发送 Ctrl+Break(等效于控制台 Ctrl+C)。
// 注意 Windows 没有 SIGTERM,Ctrl+Break 是最接近的"礼貌终止"信号。
func gracefulStop(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return fmt.Errorf("无进程句柄")
	}
	// 生成 ctrlEvent 发送给整个进程组。
	dll := syscall.NewLazyDLL("kernel32.dll")
	proc := dll.NewProc("GenerateConsoleCtrlEvent")
	// CTRL_BREAK_EVENT = 1
	ret, _, err := proc.Call(1, uintptr(cmd.Process.Pid))
	if ret == 0 {
		return fmt.Errorf("发送 Ctrl+Break 失败: %v", err)
	}
	return nil
}

// killProcessTree 用 taskkill /T /F 强杀指定 PID 及其全部子进程。
// /T = 含子进程; /F = 强制。这是 Windows 上最可靠的整树终止方式。
func killProcessTree(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("PID 无效: %d", pid)
	}
	cmd := exec.Command("taskkill", "/PID", fmt.Sprint(pid), "/T", "/F")
	out, err := cmd.CombinedOutput()
	if err != nil {
		// 进程可能已自行退出,taskkill 会报"找不到进程",视作成功。
		return nil
	}
	_ = out
	return nil
}

// waitForExit 轮询 PID 是否仍存在,最多等待 timeout。
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

// pidAlive 用 tasklist 探测 PID 是否存在。
// 比 syscall.Signal(0) 更可靠(Windows 上后者行为不明确)。
//
// 判定逻辑:tasklist 在 PID 存在时输出 CSV 行,形如 "PING.EXE","27412",...;
// 不存在时输出"信息: 没有运行的任务..."等提示。
// 因此用"输出中是否出现 \"<pid>\" (带引号的 PID)"作为存活依据,
// 既避免误判,又兼容中英文系统(提示行不会出现带引号的 PID)。
func pidAlive(pid int) bool {
	out, err := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/NH", "/FO", "CSV").Output()
	if err != nil {
		return false
	}
	// CSV 中 PID 字段为 ","<pid>"," 形式。
	needle := fmt.Sprintf("\",\"%d\"", pid)
	return strings.Contains(string(out), needle)
}
