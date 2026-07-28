// Package runtimeutil 提供本机运行环境探测(JDK 等)。
package runtimeutil

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// DetectedRuntime 探测到的运行环境候选。
type DetectedRuntime struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // jdk
	Version     string `json:"version"`
	InstallPath string `json:"install_path"`
	Source      string `json:"source"` // env / path / scan
	Exists      bool   `json:"exists"`
}

// DetectJDK 扫描本机常见 JDK 安装位置 + JAVA_HOME + PATH 中的 java。
func DetectJDK() []DetectedRuntime {
	seen := map[string]bool{}
	var out []DetectedRuntime

	add := func(name, version, path, source string) {
		path = filepath.Clean(path)
		if path == "" || path == "." {
			return
		}
		key := strings.ToLower(path)
		if seen[key] {
			return
		}
		// 必须是有效 JAVA_HOME(含 bin/java 或 bin/java.exe)
		if !isValidJavaHome(path) {
			return
		}
		seen[key] = true
		if version == "" {
			version = probeJavaVersion(path)
		}
		if name == "" {
			name = "JDK " + version
			if version == "" {
				name = "JDK @ " + filepath.Base(path)
			}
		}
		out = append(out, DetectedRuntime{
			Name:        name,
			Type:        "jdk",
			Version:     version,
			InstallPath: path,
			Source:      source,
			Exists:      true,
		})
	}

	// 1) JAVA_HOME
	if jh := strings.TrimSpace(os.Getenv("JAVA_HOME")); jh != "" {
		add("JAVA_HOME", "", jh, "env")
	}

	// 2) PATH 中的 java → 推导 JAVA_HOME
	if javaBin, err := exec.LookPath("java"); err == nil {
		// .../bin/java → .../
		binDir := filepath.Dir(javaBin)
		home := filepath.Dir(binDir)
		add("PATH java", "", home, "path")
	}

	// 3) 常见安装目录扫描
	for _, root := range javaSearchRoots() {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			name := e.Name()
			lower := strings.ToLower(name)
			// 过滤明显非 JDK 目录
			if !strings.Contains(lower, "jdk") &&
				!strings.Contains(lower, "jre") &&
				!strings.Contains(lower, "java") &&
				!strings.Contains(lower, "temurin") &&
				!strings.Contains(lower, "corretto") &&
				!strings.Contains(lower, "zulu") &&
				!strings.Contains(lower, "microsoft") &&
				!strings.Contains(lower, "graal") &&
				!strings.Contains(lower, "semeru") {
				// 仍尝试:有些目录名就是 17.0.9
				if !looksLikeVersionDir(name) {
					continue
				}
			}
			full := filepath.Join(root, name)
			add(name, "", full, "scan")
		}
		// 根目录本身也可能是 JAVA_HOME
		add(filepath.Base(root), "", root, "scan")
	}

	return out
}

func isValidJavaHome(home string) bool {
	candidates := []string{
		filepath.Join(home, "bin", "java.exe"),
		filepath.Join(home, "bin", "java"),
	}
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return true
		}
	}
	return false
}

func probeJavaVersion(javaHome string) string {
	java := filepath.Join(javaHome, "bin", "java")
	if runtime.GOOS == "windows" {
		java = filepath.Join(javaHome, "bin", "java.exe")
	}
	cmd := exec.Command(java, "-version")
	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		return ""
	}
	// java -version 输出在 stderr,形如: openjdk version "17.0.9" ...
	text := string(out)
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if i := strings.Index(line, "version \""); i >= 0 {
			rest := line[i+len("version \""):]
			if j := strings.Index(rest, "\""); j >= 0 {
				return rest[:j]
			}
		}
		if i := strings.Index(line, "version \""); i >= 0 {
			_ = i
		}
	}
	return ""
}

func looksLikeVersionDir(name string) bool {
	// 17 / 17.0.9 / jdk-17 等
	if len(name) == 0 {
		return false
	}
	hasDigit := false
	for _, c := range name {
		if c >= '0' && c <= '9' {
			hasDigit = true
			break
		}
	}
	return hasDigit
}

func javaSearchRoots() []string {
	var roots []string
	if runtime.GOOS == "windows" {
		pf := os.Getenv("ProgramFiles")
		pf86 := os.Getenv("ProgramFiles(x86)")
		local := os.Getenv("LOCALAPPDATA")
		candidates := []string{
			filepath.Join(pf, "Java"),
			filepath.Join(pf, "Eclipse Adoptium"),
			filepath.Join(pf, "Microsoft"),
			filepath.Join(pf, "Amazon Corretto"),
			filepath.Join(pf, "Zulu"),
			filepath.Join(pf, "BellSoft"),
			filepath.Join(pf, "GraalVM"),
			filepath.Join(pf, "Semeru"),
			filepath.Join(pf86, "Java"),
			filepath.Join(local, "Programs", "Eclipse Adoptium"),
			`C:\Java`,
			`C:\jdk`,
			`D:\Java`,
			`D:\jdk`,
		}
		for _, c := range candidates {
			if c != "" && c != string(filepath.Separator) {
				roots = append(roots, c)
			}
		}
	} else {
		roots = []string{
			"/usr/lib/jvm",
			"/usr/java",
			"/opt/java",
			"/opt/jdk",
			"/Library/Java/JavaVirtualMachines",
		}
	}
	return roots
}
