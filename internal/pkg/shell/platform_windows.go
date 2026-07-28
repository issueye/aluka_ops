//go:build windows

package shell

import (
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

func setShellSysProcAttr(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	// 独立进程组 + 隐藏控制台窗口,避免弹出黑框
	cmd.SysProcAttr.CreationFlags = windows.CREATE_NEW_PROCESS_GROUP
	cmd.SysProcAttr.HideWindow = true
}
