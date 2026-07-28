// Package artifact 封装制品(安装包)的存储、校验与部署。
//
// 设计:
//   - store.go :保存上传文件、计算 SHA256、识别单文件/zip、制品路径管理
//   - deploy.go:部署制品到 install_dir(单文件复制 / zip 解压)
package artifact

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

// Kind 制品类型。
type Kind string

const (
	KindSingle Kind = "single" // 单文件(jar/exe/bat/ps1)
	KindZip    Kind = "zip"    // zip 压缩包
)

// Store 制品存储器:管理磁盘上的制品文件。
type Store struct {
	dataDir string // data 根目录
}

var ErrOutsideRoot = errors.New("路径越出制品根目录")
var ErrInvalidComponent = errors.New("制品路径组件无效")

// NewStore 构造。
func NewStore(dataDir string) *Store {
	return &Store{dataDir: dataDir}
}

func validComponent(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && value != "." && value != ".." && !filepath.IsAbs(value) &&
		!strings.ContainsAny(value, `/\\:`)
}

func (s *Store) resolveStoragePath(storagePath string, allowMissing bool) (string, error) {
	if s == nil || strings.TrimSpace(storagePath) == "" {
		return "", ErrOutsideRoot
	}
	root, err := filepath.Abs(filepath.Clean(s.artifactsRoot()))
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Clean(storagePath))
	if err != nil || !isUnder(root, path) {
		return "", ErrOutsideRoot
	}
	if err := checkNoSymlink(root, path, allowMissing); err != nil {
		return "", err
	}
	return path, nil
}

func isUnder(root, path string) bool {
	root = filepath.Clean(root)
	path = filepath.Clean(path)
	if root == path {
		return true
	}
	return strings.HasPrefix(path, root+string(os.PathSeparator))
}

func checkNoSymlink(root, path string, allowMissing bool) error {
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return ErrOutsideRoot
	}
	current := root
	for _, part := range strings.Split(rel, string(os.PathSeparator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			if allowMissing {
				return nil
			}
			return os.ErrNotExist
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrOutsideRoot
		}
	}
	return nil
}

// artifactsRoot 制品存储根目录:data/artifacts
func (s *Store) artifactsRoot() string { return filepath.Join(s.dataDir, "artifacts") }

// SaveFromUpload 保存上传的制品文件,返回相对存储路径、大小、SHA256、类型。
//
// 存储结构:data/artifacts/<serviceCode>/<version>/<filename>
func (s *Store) SaveFromUpload(fh *multipart.FileHeader, serviceCode, version string) (
	storagePath string, size int64, checksum, filename string, kind Kind, err error,
) {
	filename = filepath.Base(fh.Filename)
	if !validComponent(filename) {
		return "", 0, "", "", "", ErrInvalidComponent
	}
	if !validComponent(serviceCode) || !validComponent(version) {
		return "", 0, "", "", "", ErrInvalidComponent
	}

	dir := filepath.Join(s.artifactsRoot(), serviceCode, version)
	if _, err := s.resolveStoragePath(dir, true); err != nil {
		return "", 0, "", "", "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", 0, "", "", "", fmt.Errorf("创建制品目录失败: %w", err)
	}
	if _, err := s.resolveStoragePath(dir, false); err != nil {
		return "", 0, "", "", "", err
	}

	dst := filepath.Join(dir, filename)
	if _, err := s.resolveStoragePath(dst, true); err != nil {
		return "", 0, "", "", "", err
	}

	src, err := fh.Open()
	if err != nil {
		return "", 0, "", "", "", fmt.Errorf("打开上传文件失败: %w", err)
	}
	defer src.Close()

	out, err := os.Create(dst)
	if err != nil {
		return "", 0, "", "", "", fmt.Errorf("创建制品文件失败: %w", err)
	}
	defer out.Close()

	// 边复制边计算 SHA256,避免二次读取大文件
	h := sha256.New()
	w := io.MultiWriter(out, h)
	size, err = io.Copy(w, src)
	if err != nil {
		_ = os.Remove(dst) // 清理半成品
		return "", 0, "", "", "", fmt.Errorf("写入制品文件失败: %w", err)
	}
	checksum = hex.EncodeToString(h.Sum(nil))

	kind = DetectKind(filename)
	return dst, size, checksum, filename, kind, nil
}

// DeleteFile 删除制品磁盘文件(忽略不存在错误)。
func (s *Store) DeleteFile(storagePath string) error {
	if storagePath == "" {
		return nil
	}
	path, err := s.resolveStoragePath(storagePath, true)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// ResolveFile 验证并返回制品文件的真实路径,供下载/校验/部署使用。
func (s *Store) ResolveFile(storagePath string) (string, error) {
	return s.resolveStoragePath(storagePath, false)
}

// VerifyChecksum 校验文件 SHA256 是否匹配(用于部署前防损坏)。
func (s *Store) VerifyChecksum(path, expected string) (bool, error) {
	resolved, err := s.ResolveFile(path)
	if err != nil {
		return false, err
	}
	return verifyChecksum(resolved, expected)
}

func verifyChecksum(path, expected string) (bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return false, err
	}
	got := hex.EncodeToString(h.Sum(nil))
	return got == expected, nil
}

// VerifyChecksum 保留旧调用兼容性;调用方若有 Store 应优先使用其方法。
func VerifyChecksum(path, expected string) (bool, error) {
	return verifyChecksum(path, expected)
}

// DetectKind 按文件扩展名判断制品类型。
func DetectKind(filename string) Kind {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".zip" {
		return KindZip
	}
	return KindSingle
}
