package artifact

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// DeployResult 部署结果。
type DeployResult struct {
	InstallDir string // 实际部署目录
	EntryFile  string // 探测到的主入口文件(jar/exe),用于配置启动命令;无则空
	Kind       Kind   // 部署类型
}

func ValidateInstallDir(dataDir, installDir string) (string, error) {
	if strings.TrimSpace(installDir) == "" {
		return "", fmt.Errorf("install_dir 未指定")
	}
	root, err := filepath.Abs(filepath.Clean(dataDir))
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Clean(installDir))
	if err != nil || !isUnder(root, path) {
		return "", ErrOutsideRoot
	}
	if err := checkNoSymlink(root, path, true); err != nil {
		return "", err
	}
	return path, nil
}

//   - zip    :解压到 install_dir/
//
// install_dir 为空时,使用 defaultInstallDir(dataDir, serviceCode)。
// 部署前会清空 install_dir(保证干净的版本),失败时回滚(恢复清空的文件较复杂,
// 此处采用"先部署到临时目录,成功后原子替换"的策略降低风险)。
func Deploy(storagePath string, kind Kind, installDir string) (*DeployResult, error) {
	if installDir == "" {
		return nil, fmt.Errorf("install_dir 未指定")
	}
	if storagePath == "" {
		return nil, fmt.Errorf("制品存储路径为空")
	}

	// 原子替换:先部署到 install_dir.new,成功后删除旧目录并重命名。
	// 避免部署失败导致 install_dir 处于半成品状态。
	tmpDir := installDir + ".new"
	backupDir := installDir + ".old"

	// 清理可能残留的临时目录
	_ = os.RemoveAll(tmpDir)
	_ = os.RemoveAll(backupDir)

	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建临时部署目录失败: %w", err)
	}

	var entry string
	var err error
	switch kind {
	case KindSingle:
		entry, err = deploySingle(storagePath, tmpDir)
	case KindZip:
		entry, err = deployZip(storagePath, tmpDir)
	default:
		// 兜底:按文件名重新探测
		switch DetectKind(storagePath) {
		case KindZip:
			entry, err = deployZip(storagePath, tmpDir)
		default:
			entry, err = deploySingle(storagePath, tmpDir)
		}
	}
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		return nil, err
	}

	// 原子替换:旧目录改名为 .old → 新目录改名为正式 → 删除 .old
	if _, statErr := os.Stat(installDir); statErr == nil {
		if err := os.Rename(installDir, backupDir); err != nil {
			_ = os.RemoveAll(tmpDir)
			return nil, fmt.Errorf("备份旧目录失败: %w", err)
		}
	}
	if err := os.Rename(tmpDir, installDir); err != nil {
		// 回滚:恢复 .old
		if _, e := os.Stat(backupDir); e == nil {
			_ = os.Rename(backupDir, installDir)
		}
		_ = os.RemoveAll(tmpDir)
		return nil, fmt.Errorf("替换部署目录失败: %w", err)
	}
	_ = os.RemoveAll(backupDir)

	// 入口文件路径补全为 install_dir 下绝对路径
	fullEntry := entry
	if entry != "" {
		fullEntry = filepath.Join(installDir, entry)
	}

	return &DeployResult{
		InstallDir: installDir,
		EntryFile:  fullEntry,
		Kind:       kind,
	}, nil
}

// deploySingle 复制单文件到目标目录,返回入口文件相对路径。
func deploySingle(src, dstDir string) (string, error) {
	name := filepath.Base(src)
	dst := filepath.Join(dstDir, name)
	in, err := os.Open(src)
	if err != nil {
		return "", fmt.Errorf("打开制品失败: %w", err)
	}
	defer in.Close()

	info, err := in.Stat()
	if err != nil {
		return "", err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return "", fmt.Errorf("创建目标文件失败: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return "", fmt.Errorf("复制文件失败: %w", err)
	}
	return name, nil
}

// deployZip 解压 zip 到目标目录,返回探测到的主入口文件相对路径。
func deployZip(srcZip, dstDir string) (string, error) {
	r, err := zip.OpenReader(srcZip)
	if err != nil {
		return "", fmt.Errorf("打开 zip 失败: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		if err := extractZipFile(f, dstDir); err != nil {
			return "", err
		}
	}
	// 解压后探测主入口(jar/exe),供配置启动命令。
	return detectEntry(dstDir), nil
}

// extractZipFile 解压单个 zip 条目(安全:防 Zip Slip 路径穿越)。
func extractZipFile(f *zip.File, dstDir string) error {
	name := strings.ReplaceAll(f.Name, "\\", "/")
	if name == "" || filepath.IsAbs(name) || (len(name) >= 2 && name[1] == ':') {
		return fmt.Errorf("zip 含非法路径: %s", f.Name)
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." || part == "." || part == "" {
			if part == "" && name != "" {
				continue
			}
			return fmt.Errorf("zip 含非法路径: %s", f.Name)
		}
		if strings.ContainsAny(part, `<>:"|?*`) {
			return fmt.Errorf("zip 含非法路径: %s", f.Name)
		}
	}
	target := filepath.Join(dstDir, filepath.FromSlash(name))
	if !isUnder(filepath.Clean(dstDir), filepath.Clean(target)) {
		return fmt.Errorf("zip 含非法路径: %s", f.Name)
	}
	if err := checkNoSymlink(filepath.Clean(dstDir), filepath.Dir(target), true); err != nil {
		return err
	}

	if f.FileInfo().IsDir() {
		return os.MkdirAll(target, f.Mode())
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}

	in, err := f.Open()
	if err != nil {
		return fmt.Errorf("打开 zip 条目失败: %w", err)
	}
	defer in.Close()

	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
	if err != nil {
		return fmt.Errorf("创建解压文件失败: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return fmt.Errorf("解压文件失败: %w", err)
	}
	return nil
}

// detectEntry 扫描目录,探测主入口文件(jar/exe/bat/ps1)。
// 优先级:jar > exe > bat > ps1。用于解压后辅助配置启动命令。
func detectEntry(dir string) string {
	var jar, exe, bat, ps1 string
	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		ext := strings.ToLower(filepath.Ext(info.Name()))
		switch ext {
		case ".jar":
			if jar == "" {
				jar = rel
			}
		case ".exe":
			if exe == "" {
				exe = rel
			}
		case ".bat":
			if bat == "" {
				bat = rel
			}
		case ".ps1":
			if ps1 == "" {
				ps1 = rel
			}
		}
		return nil
	})
	switch {
	case jar != "":
		return jar
	case exe != "":
		return exe
	case bat != "":
		return bat
	case ps1 != "":
		return ps1
	}
	return ""
}

// CleanDir 清空目录内容(用于卸载)。目录本身保留或删除由 keepDir 决定。
func CleanDir(dir string, keepDir bool) error {
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if err := os.RemoveAll(filepath.Join(dir, e.Name())); err != nil {
			return err
		}
	}
	if !keepDir {
		_ = os.Remove(dir)
	}
	return nil
}

// DefaultInstallDir 默认 install_dir:data/services/<serviceCode>
func DefaultInstallDir(dataDir, serviceCode string) string {
	return filepath.Join(dataDir, "services", serviceCode)
}
