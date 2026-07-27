// Package artifact 封装制品(安装包)的存储、校验与部署。
//
// 设计:
//   - store.go :保存上传文件、计算 SHA256、识别单文件/zip、制品路径管理
//   - deploy.go:部署制品到 install_dir(单文件复制 / zip 解压)
package artifact

import (
	"crypto/sha256"
	"encoding/hex"
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

// NewStore 构造。
func NewStore(dataDir string) *Store {
	return &Store{dataDir: dataDir}
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
	if filename == "" || filename == "." || filename == "/" {
		return "", 0, "", "", "", fmt.Errorf("无效的文件名")
	}

	dir := filepath.Join(s.artifactsRoot(), serviceCode, version)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", 0, "", "", "", fmt.Errorf("创建制品目录失败: %w", err)
	}

	dst := filepath.Join(dir, filename)

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
	err := os.Remove(storagePath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// VerifyChecksum 校验文件 SHA256 是否匹配(用于部署前防损坏)。
func VerifyChecksum(path, expected string) (bool, error) {
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

// DetectKind 按文件扩展名判断制品类型。
func DetectKind(filename string) Kind {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".zip" {
		return KindZip
	}
	return KindSingle
}
