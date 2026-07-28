// Package shell 提供服务器级交互式 Shell 会话(Web 控制台)。
//
// 伪终端:
//   - Linux/macOS: creack/pty
//   - Windows: ConPTY (UserExistsError/conpty)
//
// 会话 I/O 为原始字节流,前端 xterm 直通按键与输出。
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

// Session 一个交互式 PTY shell。
type Session struct {
	ID        string
	Shell     string
	StartedAt time.Time
	Cols      uint16
	Rows      uint16

	// 平台实现:读写同一 PTY 主端
	io     io.ReadWriteCloser
	cmd    *exec.Cmd // Unix 侧保留以便 Kill;Windows 可能为 nil
	closer func() error

	closed atomic.Bool
	writeMu sync.Mutex
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

// DefaultShell 当前平台默认 shell。
func DefaultShell() string {
	if runtime.GOOS == "windows" {
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
		{"id": "bash", "name": "Bash", "desc": "交互式 bash + PTY"},
		{"id": "sh", "name": "sh", "desc": "POSIX sh + PTY"},
	}
}

// Backend 返回伪终端后端名。
func Backend() string {
	if runtime.GOOS == "windows" {
		return "conpty"
	}
	return "pty"
}

// Create 启动 PTY shell 会话。
// shellType: powershell | powershell_noprofile | cmd | bash | sh
// cols/rows 初始终端尺寸,0 则默认 120x30。
func (m *Manager) Create(shellType string, cols, rows uint16) (*Session, error) {
	m.mu.Lock()
	if len(m.sessions) >= m.max {
		m.mu.Unlock()
		return nil, ErrTooManySessions
	}
	m.mu.Unlock()

	if shellType == "" {
		shellType = DefaultShell()
	}
	switch shellType {
	case "ps", "pwsh":
		shellType = "powershell"
	case "ps_clean", "powershell-noprofile":
		shellType = "powershell_noprofile"
	}
	if cols == 0 {
		cols = 120
	}
	if rows == 0 {
		rows = 30
	}

	name, args, err := shellCmd(shellType)
	if err != nil {
		return nil, err
	}

	workDir := m.dataDir
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		workDir = home
	}

	env := append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)
	if runtime.GOOS == "windows" {
		env = append(env, "POWERSHELL_TELEMETRY_OPTOUT=1")
	}

	rw, cmd, closer, err := startPTY(name, args, workDir, env, cols, rows)
	if err != nil {
		return nil, fmt.Errorf("启动 PTY 失败: %w", err)
	}

	id := fmt.Sprintf("sh-%d-%d", time.Now().UnixMilli(), m.seq.Add(1))
	s := &Session{
		ID:        id,
		Shell:     shellType,
		StartedAt: time.Now(),
		Cols:      cols,
		Rows:      rows,
		io:        rw,
		cmd:       cmd,
		closer:    closer,
	}

	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()

	// 进程退出后清理映射(仅 Unix 有 *exec.Cmd;Windows 由读侧 EOF/Close 清理)
	if cmd != nil {
		go func() {
			_ = cmd.Wait()
			s.markClosed()
			m.mu.Lock()
			delete(m.sessions, id)
			m.mu.Unlock()
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
		args = []string{"-NoLogo", "-ExecutionPolicy", "Bypass"}
		if shellType == "powershell_noprofile" {
			args = append(args, "-NoProfile")
		}
		// 交互式:不使用 -Command -,由 PTY 驱动完整交互
	case "cmd":
		if runtime.GOOS != "windows" {
			return "", nil, fmt.Errorf("cmd 仅支持 Windows")
		}
		name = "cmd.exe"
		args = []string{}
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
			"cols":       s.Cols,
			"rows":       s.Rows,
			"closed":     s.closed.Load(),
			"backend":    Backend(),
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

// Write 向 PTY 写入原始字节(按键透传)。
func (s *Session) Write(p []byte) (int, error) {
	if s.closed.Load() {
		return 0, ErrSessionClosed
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.io == nil {
		return 0, ErrSessionClosed
	}
	return s.io.Write(p)
}

// Read 从 PTY 读取输出。
func (s *Session) Read(p []byte) (int, error) {
	if s.closed.Load() {
		return 0, io.EOF
	}
	if s.io == nil {
		return 0, io.EOF
	}
	return s.io.Read(p)
}

// Resize 调整终端尺寸。
func (s *Session) Resize(cols, rows uint16) error {
	if s.closed.Load() {
		return ErrSessionClosed
	}
	if cols == 0 || rows == 0 {
		return nil
	}
	if err := resizePTY(s, cols, rows); err != nil {
		return err
	}
	s.Cols = cols
	s.Rows = rows
	return nil
}

// Close 关闭 PTY 与进程。
func (s *Session) Close() error {
	if s.closed.Swap(true) {
		return nil
	}
	var err error
	if s.closer != nil {
		err = s.closer()
	} else if s.io != nil {
		err = s.io.Close()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
	return err
}

func (s *Session) markClosed() {
	s.closed.Store(true)
}

// Alive 是否仍在运行。
func (s *Session) Alive() bool {
	return s != nil && !s.closed.Load()
}

// Stdout 兼容旧接口:返回自身作为 Reader。
func (s *Session) Stdout() io.Reader { return s }
