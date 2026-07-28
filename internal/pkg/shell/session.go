// Package shell 提供服务器级交互式 Shell 会话(Web 控制台)。
// Windows 默认 PowerShell,Unix 默认 bash。
package shell

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

var (
	ErrSessionNotFound = errors.New("会话不存在")
	ErrSessionClosed   = errors.New("会话已关闭")
	ErrTooManySessions = errors.New("会话数已达上限")
)

// Session 一个交互式 shell 进程。
type Session struct {
	ID        string
	Shell     string
	StartedAt time.Time

	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser

	closed atomic.Bool
	mu     sync.Mutex
}

// Manager 管理多个 shell 会话。
type Manager struct {
	mu       sync.Mutex
	sessions map[string]*Session
	max      int
	seq      atomic.Uint64
	dataDir  string
}

// NewManager 构造;max<=0 时默认 4。
func NewManager(dataDir string, max int) *Manager {
	if max <= 0 {
		max = 4
	}
	return &Manager{
		sessions: make(map[string]*Session),
		max:      max,
		dataDir:  dataDir,
	}
}

// DefaultShell 当前平台默认 shell 类型。
func DefaultShell() string {
	if runtime.GOOS == "windows" {
		// 默认无 profile,避免用户 profile 报错干扰 Web 控制台
		return "powershell_noprofile"
	}
	return "bash"
}

// AvailableShells 当前平台可选 shell。
func AvailableShells() []map[string]string {
	if runtime.GOOS == "windows" {
		return []map[string]string{
			{"id": "powershell", "name": "PowerShell", "desc": "Windows PowerShell(加载 profile)"},
			{"id": "powershell_noprofile", "name": "PowerShell (无配置)", "desc": "跳过 profile,更干净(推荐)"},
			{"id": "cmd", "name": "CMD", "desc": "命令提示符 cmd.exe"},
		}
	}
	return []map[string]string{
		{"id": "bash", "name": "Bash", "desc": "交互式 bash"},
		{"id": "sh", "name": "sh", "desc": "POSIX sh"},
	}
}

// Create 启动一个 shell 会话。
// shellType: powershell | cmd | bash | sh;空则平台默认。
func (m *Manager) Create(shellType string) (*Session, error) {
	m.mu.Lock()
	if len(m.sessions) >= m.max {
		m.mu.Unlock()
		return nil, ErrTooManySessions
	}
	m.mu.Unlock()

	if shellType == "" {
		shellType = DefaultShell()
	}
	// 别名
	switch shellType {
	case "ps", "pwsh":
		shellType = "powershell"
	case "ps_clean", "powershell-noprofile":
		shellType = "powershell_noprofile"
	}

	name, args, err := shellCmd(shellType)
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(name, args...)
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		cmd.Dir = home
	} else if m.dataDir != "" {
		cmd.Dir = m.dataDir
	}
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
	)
	if runtime.GOOS == "windows" {
		cmd.Env = append(cmd.Env, "POWERSHELL_TELEMETRY_OPTOUT=1")
	}
	setShellSysProcAttr(cmd)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, fmt.Errorf("stdout: %w", err)
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, fmt.Errorf("启动 shell 失败: %w", err)
	}

	id := fmt.Sprintf("sh-%d-%d", time.Now().UnixMilli(), m.seq.Add(1))
	s := &Session{
		ID:        id,
		Shell:     shellType,
		StartedAt: time.Now(),
		cmd:       cmd,
		stdin:     stdin,
		stdout:    stdout,
	}

	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()

	go func() {
		_ = cmd.Wait()
		s.closed.Store(true)
		s.mu.Lock()
		if s.stdin != nil {
			_ = s.stdin.Close()
			s.stdin = nil
		}
		s.mu.Unlock()
		m.mu.Lock()
		delete(m.sessions, id)
		m.mu.Unlock()
	}()

	// Windows PowerShell:启动后初始化编码与欢迎语
	if shellType == "powershell" || shellType == "powershell_noprofile" {
		go func() {
			time.Sleep(300 * time.Millisecond)
			_ = s.WriteLine("$ProgressPreference='SilentlyContinue'; try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}; Write-Host 'Aluka Ops Web Console (PowerShell)' -ForegroundColor Cyan")
		}()
	}

	return s, nil
}

func shellCmd(shellType string) (name string, args []string, err error) {
	switch shellType {
	case "powershell", "powershell_noprofile":
		if runtime.GOOS == "windows" {
			name = "powershell.exe"
		} else {
			name = "pwsh"
		}
		// -Command - : 从 stdin 持续读取命令(管道模式)
		args = []string{
			"-NoLogo",
			"-NoExit",
			"-ExecutionPolicy", "Bypass",
		}
		if shellType == "powershell_noprofile" {
			args = append(args, "-NoProfile")
		}
		args = append(args, "-Command", "-")
	case "cmd":
		if runtime.GOOS != "windows" {
			return "", nil, fmt.Errorf("cmd 仅支持 Windows")
		}
		name = "cmd.exe"
		// /Q 关闭 echo;/K 执行后保持
		args = []string{"/Q", "/K", "prompt $P$G"}
	case "bash":
		name = "bash"
		args = []string{"--login", "-i"}
	case "sh":
		name = "sh"
		args = []string{"-i"}
	default:
		return "", nil, fmt.Errorf("不支持的 shell: %s", shellType)
	}
	return name, args, nil
}

// Get 取会话。
func (m *Manager) Get(id string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if !ok || s.closed.Load() {
		return nil, ErrSessionNotFound
	}
	return s, nil
}

// List 当前会话摘要。
func (m *Manager) List() []map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]map[string]any, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, map[string]any{
			"id":         s.ID,
			"shell":      s.Shell,
			"started_at": s.StartedAt,
			"closed":     s.closed.Load(),
		})
	}
	return out
}

// Close 关闭会话。
func (m *Manager) Close(id string) error {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if !ok {
		return ErrSessionNotFound
	}
	return s.Close()
}

// CloseAll 关闭全部。
func (m *Manager) CloseAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		_ = m.Close(id)
	}
}

// Write 向 shell stdin 写入原始字节。
func (s *Session) Write(p []byte) (int, error) {
	if s.closed.Load() {
		return 0, ErrSessionClosed
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stdin == nil {
		return 0, ErrSessionClosed
	}
	return s.stdin.Write(p)
}

// WriteLine 写入一行(Windows 用 CRLF)。
func (s *Session) WriteLine(line string) error {
	payload := line
	if runtime.GOOS == "windows" {
		if payload == "" {
			payload = "\r\n"
		} else if !hasEOL(payload) {
			payload += "\r\n"
		} else {
			payload = toCRLF(payload)
		}
	} else {
		if payload == "" {
			payload = "\n"
		} else if !hasEOL(payload) {
			payload += "\n"
		}
	}
	_, err := s.Write([]byte(payload))
	return err
}

func hasEOL(s string) bool {
	n := len(s)
	return n > 0 && (s[n-1] == '\n')
}

func toCRLF(s string) string {
	// 简单把孤立 \n 换成 \r\n(若已是 \r\n 则不动)
	out := make([]byte, 0, len(s)+8)
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			if i == 0 || s[i-1] != '\r' {
				out = append(out, '\r', '\n')
				continue
			}
		}
		out = append(out, s[i])
	}
	return string(out)
}

// Stdout 输出 reader。
func (s *Session) Stdout() io.Reader { return s.stdout }

// Close 终止 shell。
func (s *Session) Close() error {
	if s.closed.Swap(true) {
		return nil
	}
	s.mu.Lock()
	if s.stdin != nil {
		_ = s.stdin.Close()
		s.stdin = nil
	}
	s.mu.Unlock()
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		_, _ = s.cmd.Process.Wait()
	}
	return nil
}

// Alive 是否仍在运行。
func (s *Session) Alive() bool {
	return s != nil && !s.closed.Load()
}
