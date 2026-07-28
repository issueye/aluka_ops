// Package files 在 data 目录内提供安全的文件/目录 CRUD。
// 所有路径均相对于 root(通常为 config.DataDir),禁止越界。
package files

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

// 限制
const (
	MaxTextReadBytes  = 2 << 20  // 文本读取上限 2MB
	MaxTextWriteBytes = 5 << 20  // 文本写入上限 5MB
	MaxUploadBytes    = 200 << 20 // 单文件上传 200MB
)

var (
	ErrOutsideRoot = errors.New("路径越出允许的根目录")
	ErrNotFound    = errors.New("文件或目录不存在")
	ErrIsDir       = errors.New("目标是目录")
	ErrNotDir      = errors.New("目标不是目录")
	ErrExists      = errors.New("目标已存在")
	ErrInvalidName = errors.New("非法名称")
	ErrTooLarge    = errors.New("内容过大")
	ErrNotText     = errors.New("不是可编辑的文本文件")
	ErrRootDelete  = errors.New("不能删除根目录")
)

// Entry 目录项。
type Entry struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"` // 相对 root 的 POSIX 风格路径
	IsDir   bool      `json:"is_dir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"mod_time"`
	Mode    string    `json:"mode"`
	Ext     string    `json:"ext,omitempty"`
}

// ListResult 列目录结果。
type ListResult struct {
	Root    string  `json:"root"`    // 绝对根路径(只读展示)
	Path    string  `json:"path"`    // 当前相对路径
	Parent  string  `json:"parent"`  // 上级相对路径,根时为空
	Entries []Entry `json:"entries"`
}

// Store 限定在 root 下的文件操作。
type Store struct {
	root string // 绝对路径
}

// NewStore 构造;root 会 Clean + Abs。
func NewStore(root string) (*Store, error) {
	abs, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("创建文件根目录失败: %w", err)
	}
	return &Store{root: abs}, nil
}

// Root 返回绝对根路径。
func (s *Store) Root() string { return s.root }

// resolve 把相对路径解析为绝对路径,并确保仍在 root 内。
// rel 使用 / 或系统分隔符均可;空或 "." 表示根。
func (s *Store) resolve(rel string) (abs string, cleanRel string, err error) {
	rel = strings.TrimSpace(rel)
	rel = strings.ReplaceAll(rel, "\\", "/")
	// 禁止 UNC / 双斜线网络路径
	if strings.HasPrefix(rel, "//") {
		return "", "", ErrOutsideRoot
	}
	rel = strings.TrimLeft(rel, "/")
	// 拒绝空段中的 .. 等在 Join 前先 Clean 相对部分
	if rel == "" || rel == "." {
		return s.root, "", nil
	}
	// 禁止绝对路径与盘符
	if filepath.IsAbs(rel) || (len(rel) >= 2 && rel[1] == ':') {
		return "", "", ErrOutsideRoot
	}
	// 规范化
	parts := strings.Split(rel, "/")
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		if p == "" || p == "." {
			continue
		}
		if p == ".." {
			return "", "", ErrOutsideRoot
		}
		// 禁止 Windows 保留名中的非法字符
		if strings.ContainsAny(p, `<>:"|?*`) {
			return "", "", ErrInvalidName
		}
		clean = append(clean, p)
	}
	cleanRel = strings.Join(clean, "/")
	abs = filepath.Join(s.root, filepath.FromSlash(cleanRel))
	// 二次校验:Abs 后必须仍以 root 为前缀
	abs, err = filepath.Abs(abs)
	if err != nil {
		return "", "", err
	}
	if !isUnder(s.root, abs) {
		return "", "", ErrOutsideRoot
	}
	return abs, cleanRel, nil
}

func isUnder(root, abs string) bool {
	root = filepath.Clean(root)
	abs = filepath.Clean(abs)
	if root == abs {
		return true
	}
	sep := string(os.PathSeparator)
	if !strings.HasSuffix(root, sep) {
		root += sep
	}
	// Windows 大小写不敏感
	return strings.HasPrefix(strings.ToLower(abs), strings.ToLower(root))
}

// List 列目录。
func (s *Store) List(rel string) (*ListResult, error) {
	abs, cleanRel, err := s.resolve(rel)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if !info.IsDir() {
		return nil, ErrNotDir
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(entries))
	for _, e := range entries {
		fi, err := e.Info()
		if err != nil {
			continue
		}
		name := e.Name()
		childRel := name
		if cleanRel != "" {
			childRel = cleanRel + "/" + name
		}
		ent := Entry{
			Name:    name,
			Path:    childRel,
			IsDir:   e.IsDir(),
			Size:    fi.Size(),
			ModTime: fi.ModTime(),
			Mode:    fi.Mode().String(),
		}
		if !e.IsDir() {
			ent.Ext = strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
		}
		out = append(out, ent)
	}
	// 目录在前,再按名称
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsDir != out[j].IsDir {
			return out[i].IsDir
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	parent := ""
	if cleanRel != "" {
		if i := strings.LastIndex(cleanRel, "/"); i >= 0 {
			parent = cleanRel[:i]
		} else {
			parent = ""
		}
	}
	return &ListResult{
		Root:    s.root,
		Path:    cleanRel,
		Parent:  parent,
		Entries: out,
	}, nil
}

// Stat 单文件/目录信息。
func (s *Store) Stat(rel string) (*Entry, error) {
	abs, cleanRel, err := s.resolve(rel)
	if err != nil {
		return nil, err
	}
	fi, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	name := fi.Name()
	if cleanRel == "" {
		name = filepath.Base(s.root)
	}
	ent := &Entry{
		Name:    name,
		Path:    cleanRel,
		IsDir:   fi.IsDir(),
		Size:    fi.Size(),
		ModTime: fi.ModTime(),
		Mode:    fi.Mode().String(),
	}
	if !fi.IsDir() {
		ent.Ext = strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
	}
	return ent, nil
}

// Mkdir 创建目录(支持嵌套,类似 mkdir -p 当 parents=true)。
func (s *Store) Mkdir(rel string, parents bool) error {
	abs, _, err := s.resolve(rel)
	if err != nil {
		return err
	}
	if abs == s.root {
		return ErrExists
	}
	if _, err := os.Stat(abs); err == nil {
		return ErrExists
	}
	if parents {
		return os.MkdirAll(abs, 0o755)
	}
	return os.Mkdir(abs, 0o755)
}

// WriteFile 写入文本(覆盖或新建)。
func (s *Store) WriteFile(rel string, content []byte) error {
	if int64(len(content)) > MaxTextWriteBytes {
		return ErrTooLarge
	}
	abs, cleanRel, err := s.resolve(rel)
	if err != nil {
		return err
	}
	if cleanRel == "" {
		return ErrInvalidName
	}
	// 若已存在且是目录则拒绝
	if fi, err := os.Stat(abs); err == nil && fi.IsDir() {
		return ErrIsDir
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	return os.WriteFile(abs, content, 0o644)
}

// ReadText 读取文本文件(限制大小 + UTF-8 校验)。
func (s *Store) ReadText(rel string) (string, *Entry, error) {
	abs, cleanRel, err := s.resolve(rel)
	if err != nil {
		return "", nil, err
	}
	fi, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil, ErrNotFound
		}
		return "", nil, err
	}
	if fi.IsDir() {
		return "", nil, ErrIsDir
	}
	if fi.Size() > MaxTextReadBytes {
		return "", nil, ErrTooLarge
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "", nil, err
	}
	// 简单二进制检测
	if !utf8.Valid(data) || looksBinary(data) {
		return "", nil, ErrNotText
	}
	ent := &Entry{
		Name:    fi.Name(),
		Path:    cleanRel,
		IsDir:   false,
		Size:    fi.Size(),
		ModTime: fi.ModTime(),
		Mode:    fi.Mode().String(),
		Ext:     strings.ToLower(strings.TrimPrefix(filepath.Ext(fi.Name()), ".")),
	}
	return string(data), ent, nil
}

func looksBinary(data []byte) bool {
	n := len(data)
	if n > 8000 {
		n = 8000
	}
	for i := 0; i < n; i++ {
		if data[i] == 0 {
			return true
		}
	}
	return false
}

// OpenDownload 打开文件供下载;调用方负责 Close。
func (s *Store) OpenDownload(rel string) (*os.File, *Entry, error) {
	abs, cleanRel, err := s.resolve(rel)
	if err != nil {
		return nil, nil, err
	}
	fi, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, err
	}
	if fi.IsDir() {
		return nil, nil, ErrIsDir
	}
	f, err := os.Open(abs)
	if err != nil {
		return nil, nil, err
	}
	ent := &Entry{
		Name:    fi.Name(),
		Path:    cleanRel,
		IsDir:   false,
		Size:    fi.Size(),
		ModTime: fi.ModTime(),
		Mode:    fi.Mode().String(),
		Ext:     strings.ToLower(strings.TrimPrefix(filepath.Ext(fi.Name()), ".")),
	}
	return f, ent, nil
}

// SaveUpload 保存上传内容到 rel 路径(文件)。
func (s *Store) SaveUpload(rel string, r io.Reader, size int64) error {
	if size > MaxUploadBytes {
		return ErrTooLarge
	}
	abs, cleanRel, err := s.resolve(rel)
	if err != nil {
		return err
	}
	if cleanRel == "" {
		return ErrInvalidName
	}
	if fi, err := os.Stat(abs); err == nil && fi.IsDir() {
		return ErrIsDir
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	tmp := abs + ".uploading"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	lim := io.LimitReader(r, MaxUploadBytes+1)
	n, copyErr := io.Copy(f, lim)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return closeErr
	}
	if n > MaxUploadBytes {
		_ = os.Remove(tmp)
		return ErrTooLarge
	}
	if err := os.Rename(tmp, abs); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// Rename 重命名或移动(均须在 root 内)。
func (s *Store) Rename(fromRel, toRel string) error {
	fromAbs, fromClean, err := s.resolve(fromRel)
	if err != nil {
		return err
	}
	toAbs, toClean, err := s.resolve(toRel)
	if err != nil {
		return err
	}
	if fromClean == "" || toClean == "" {
		return ErrInvalidName
	}
	if fromAbs == toAbs {
		return nil
	}
	if _, err := os.Stat(fromAbs); err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	if _, err := os.Stat(toAbs); err == nil {
		return ErrExists
	}
	if err := os.MkdirAll(filepath.Dir(toAbs), 0o755); err != nil {
		return err
	}
	return os.Rename(fromAbs, toAbs)
}

// Remove 删除文件或目录。
// recursive=false 时目录必须为空。
func (s *Store) Remove(rel string, recursive bool) error {
	abs, cleanRel, err := s.resolve(rel)
	if err != nil {
		return err
	}
	if cleanRel == "" {
		return ErrRootDelete
	}
	fi, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	if fi.IsDir() {
		if recursive {
			return os.RemoveAll(abs)
		}
		return os.Remove(abs) // 非空会失败
	}
	return os.Remove(abs)
}

// JoinRel 拼接相对路径(name 仅单层文件名,不含 /)。
func JoinRel(parent, name string) string {
	name = strings.TrimSpace(name)
	name = strings.ReplaceAll(name, "\\", "/")
	name = strings.Trim(name, "/")
	if strings.Contains(name, "/") || name == ".." || name == "." || name == "" {
		return ""
	}
	parent = strings.Trim(strings.ReplaceAll(parent, "\\", "/"), "/")
	if parent == "" || parent == "." {
		return name
	}
	return parent + "/" + name
}

// JoinRelPath 拼接父目录与相对路径(可含多层,如 folder/a.txt)。
// 会拒绝 .. 与空段;用于文件夹上传保留目录结构。
func JoinRelPath(parent, rel string) string {
	rel = strings.TrimSpace(rel)
	rel = strings.ReplaceAll(rel, "\\", "/")
	rel = strings.Trim(rel, "/")
	if rel == "" {
		return ""
	}
	parts := strings.Split(rel, "/")
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		if p == "" || p == "." {
			continue
		}
		if p == ".." {
			return ""
		}
		if strings.ContainsAny(p, `<>:"|?*`) {
			return ""
		}
		clean = append(clean, p)
	}
	if len(clean) == 0 {
		return ""
	}
	child := strings.Join(clean, "/")
	parent = strings.Trim(strings.ReplaceAll(parent, "\\", "/"), "/")
	if parent == "" || parent == "." {
		return child
	}
	return parent + "/" + child
}
