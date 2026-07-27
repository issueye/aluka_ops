// Package logstream 实现基于文件 tail 的日志流式读取与多订阅者广播。
//
// 设计:
//   - tail.go:文件读取工具(读尾部 N 行、从 offset 增量读取)
//   - hub.go :每个服务一个 LogHub,管理订阅者并持续 tail 文件
//
// 与进程管理解耦:进程仅负责把 stdout/stderr 写入日志文件,
// 本包负责"观察文件变化并广播给订阅者"。
package logstream

import (
	"bufio"
	"errors"
	"io"
	"os"
)

// ErrFileNotFound 日志文件不存在。
var ErrFileNotFound = errors.New("日志文件不存在")

// TailLines 读取文件最后 n 行。
// 用于 SSE 连接建立时立即下发历史尾部。
// 文件不存在返回 ErrFileNotFound。
func TailLines(path string, n int) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrFileNotFound
		}
		return nil, err
	}
	defer f.Close()

	// 用滑动窗口保留最后 n 行,避免大文件全量读入内存。
	// bufio 按行读,简单可靠;日志文件通常不会过大,M3 阶段够用。
	scanner := bufio.NewScanner(f)
	// 允许较长单行(默认 64KB 可能不够,放宽到 1MB)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	ring := newRing(n)
	for scanner.Scan() {
		ring.push(scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return ring.slice(), nil
}

// ringN 定长环形缓冲,保留最后 N 条。
type ringN struct {
	buf  []string
	n    int
	head int // 下一个写入位置
	full bool
}

func newRing(n int) *ringN {
	if n <= 0 {
		n = 1
	}
	return &ringN{buf: make([]string, n), n: n}
}

func (r *ringN) push(s string) {
	r.buf[r.head] = s
	r.head = (r.head + 1) % r.n
	if r.head == 0 {
		r.full = true
	}
}

func (r *ringN) slice() []string {
	if !r.full {
		// 未填满:返回 [0, head)
		out := make([]string, 0, r.head)
		out = append(out, r.buf[:r.head]...)
		return out
	}
	// 已填满:从 head 开始绕一圈,保持时序
	out := make([]string, 0, r.n)
	out = append(out, r.buf[r.head:]...)
	out = append(out, r.buf[:r.head]...)
	return out
}

// ReadFromOffset 从 offset 处读取到文件末尾的所有数据(增量读取)。
// 返回读取到的数据与新 offset(= 读取后的文件偏移)。
// 文件被截断(新 offset > 文件大小,如日志轮转/重建)返回 (nil, 0, true) 提示调用方重置。
func ReadFromOffset(path string, offset int64) (data []byte, newOffset int64, truncated bool, err error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, 0, false, ErrFileNotFound
		}
		return nil, offset, false, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, offset, false, err
	}

	// 文件比上次小 → 被重建(轮转),提示调用方从头读
	if info.Size() < offset {
		return nil, 0, true, nil
	}

	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return nil, offset, false, err
	}

	buf := make([]byte, 32*1024)
	var out []byte
	for {
		n, rerr := f.Read(buf)
		if n > 0 {
			out = append(out, buf[:n]...)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return out, offset + int64(len(out)), false, rerr
		}
	}
	return out, offset + int64(len(out)), false, nil
}

// FileSize 返回文件大小(不存在返回 -1)。
func FileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return -1
	}
	return info.Size()
}
