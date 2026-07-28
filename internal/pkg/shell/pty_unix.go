//go:build !windows

package shell

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

// startPTY 使用 creack/pty 启动交互式 shell。
func startPTY(name string, args []string, workDir string, env []string, cols, rows uint16) (io.ReadWriteCloser, *exec.Cmd, func() error, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = workDir
	cmd.Env = env
	// StartWithSize 会设置 session + controlling tty
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, nil, nil, err
	}
	closer := func() error {
		_ = ptmx.Close()
		if cmd.Process != nil {
			// 向进程组发 SIGHUP/KILL
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGHUP)
			_ = cmd.Process.Kill()
		}
		return nil
	}
	return ptmx, cmd, closer, nil
}

func resizePTY(s *Session, cols, rows uint16) error {
	if s == nil || s.io == nil {
		return ErrSessionClosed
	}
	f, ok := s.io.(*os.File)
	if !ok {
		// 兼容包装类型
		type resizer interface {
			Fd() uintptr
		}
		if _, ok := s.io.(resizer); !ok {
			return fmt.Errorf("resize: not a pty file")
		}
		// 尝试通过类型断言失败时,用反射路径不可靠;要求 *os.File
		return fmt.Errorf("resize: unsupported pty type %T", s.io)
	}
	return pty.Setsize(f, &pty.Winsize{Cols: cols, Rows: rows})
}
