//go:build windows

package shell

import (
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"

	"github.com/UserExistsError/conpty"
)

// startPTY 使用 Windows ConPTY 启动交互式 shell。
func startPTY(name string, args []string, workDir string, env []string, cols, rows uint16) (io.ReadWriteCloser, *exec.Cmd, func() error, error) {
	if !conpty.IsConPtyAvailable() {
		return nil, nil, nil, fmt.Errorf("当前 Windows 版本不支持 ConPTY(需 Windows 10 1809+)")
	}
	// commandLine: 程序路径 + 参数(CreateProcess 风格)
	cmdline := quoteCmdLine(name, args)
	cpty, err := conpty.Start(
		cmdline,
		conpty.ConPtyDimensions(int(cols), int(rows)),
		conpty.ConPtyWorkDir(workDir),
		conpty.ConPtyEnv(env),
	)
	if err != nil {
		return nil, nil, nil, err
	}
	w := &conptyWrapper{cpty: cpty}
	closer := func() error {
		return w.Close()
	}
	// Windows 侧不返回 *exec.Cmd,生命周期由 ConPty 管理
	return w, nil, closer, nil
}

func resizePTY(s *Session, cols, rows uint16) error {
	if s == nil || s.io == nil {
		return ErrSessionClosed
	}
	w, ok := s.io.(*conptyWrapper)
	if !ok || w.cpty == nil {
		return fmt.Errorf("resize: not a conpty session")
	}
	return w.cpty.Resize(int(cols), int(rows))
}

// conptyWrapper 把 *conpty.ConPty 适配为 ReadWriteCloser。
type conptyWrapper struct {
	cpty   *conpty.ConPty
	mu     sync.Mutex
	closed bool
}

func (w *conptyWrapper) Read(p []byte) (int, error) {
	return w.cpty.Read(p)
}

func (w *conptyWrapper) Write(p []byte) (int, error) {
	return w.cpty.Write(p)
}

func (w *conptyWrapper) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	w.closed = true
	return w.cpty.Close()
}

// quoteCmdLine 组装 Windows command line。
func quoteCmdLine(name string, args []string) string {
	parts := make([]string, 0, 1+len(args))
	parts = append(parts, quoteArg(name))
	for _, a := range args {
		parts = append(parts, quoteArg(a))
	}
	return strings.Join(parts, " ")
}

func quoteArg(s string) string {
	if s == "" {
		return `""`
	}
	if !strings.ContainsAny(s, " \t\"") {
		return s
	}
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(s); i++ {
		if s[i] == '"' {
			b.WriteString(`\"`)
		} else {
			b.WriteByte(s[i])
		}
	}
	b.WriteByte('"')
	return b.String()
}
