// Package hostinfo 采集本机运行时信息(CPU/内存/磁盘/负载等)。
// 供仪表盘定时刷新与 /api/system/host 查询。
package hostinfo

import (
	"fmt"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	psprocess "github.com/shirou/gopsutil/v4/process"
)

// Snapshot 一次采集结果。
type Snapshot struct {
	Hostname      string         `json:"hostname"`
	OS            string         `json:"os"`
	Platform      string         `json:"platform"`
	PlatformVer   string         `json:"platform_version"`
	KernelArch    string         `json:"kernel_arch"`
	KernelVersion string         `json:"kernel_version"`
	UptimeSec     uint64         `json:"uptime_sec"`
	BootTime      uint64         `json:"boot_time"`
	GoOS          string         `json:"go_os"`
	GoArch        string         `json:"go_arch"`
	GoVersion     string         `json:"go_version"`
	NumCPU        int            `json:"num_cpu"`
	CPUModel      string         `json:"cpu_model"`
	CPUUsedPct    float64        `json:"cpu_used_pct"`
	Load1         float64        `json:"load1"`
	Load5         float64        `json:"load5"`
	Load15        float64        `json:"load15"`
	MemTotal      uint64         `json:"mem_total"`
	MemUsed       uint64         `json:"mem_used"`
	MemAvailable  uint64         `json:"mem_available"`
	MemUsedPct    float64        `json:"mem_used_pct"`
	SwapTotal     uint64         `json:"swap_total"`
	SwapUsed      uint64         `json:"swap_used"`
	SwapUsedPct   float64        `json:"swap_used_pct"`
	Disks         []DiskUsage    `json:"disks"`
	NetBytesSent  uint64         `json:"net_bytes_sent"`
	NetBytesRecv  uint64         `json:"net_bytes_recv"`
	ProcessCount  int            `json:"process_count"`
	CollectedAt   time.Time      `json:"collected_at"`
}

// DiskUsage 单个挂载点磁盘用量。
type DiskUsage struct {
	Path      string  `json:"path"`
	Fstype    string  `json:"fstype"`
	Total     uint64  `json:"total"`
	Used      uint64  `json:"used"`
	Free      uint64  `json:"free"`
	UsedPct   float64 `json:"used_pct"`
}

// Collector 带缓存的主机信息采集器,避免前端高频轮询打满系统。
type Collector struct {
	mu       sync.Mutex
	cached   *Snapshot
	cachedAt time.Time
	ttl      time.Duration
}

// NewCollector 构造;ttl 为缓存有效期,建议 2~5 秒。
func NewCollector(ttl time.Duration) *Collector {
	if ttl <= 0 {
		ttl = 3 * time.Second
	}
	return &Collector{ttl: ttl}
}

// Get 返回缓存或重新采集。
func (c *Collector) Get() *Snapshot {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cached != nil && time.Since(c.cachedAt) < c.ttl {
		// 返回副本语义:结构体值拷贝够用
		cp := *c.cached
		return &cp
	}
	snap := collect()
	c.cached = snap
	c.cachedAt = time.Now()
	cp := *snap
	return &cp
}

func collect() *Snapshot {
	now := time.Now()
	s := &Snapshot{
		GoOS:        runtime.GOOS,
		GoArch:      runtime.GOARCH,
		GoVersion:   runtime.Version(),
		NumCPU:      runtime.NumCPU(),
		CollectedAt: now,
	}

	if hn, err := os.Hostname(); err == nil {
		s.Hostname = hn
	}

	if hi, err := host.Info(); err == nil && hi != nil {
		if s.Hostname == "" {
			s.Hostname = hi.Hostname
		}
		s.OS = hi.OS
		s.Platform = hi.Platform
		s.PlatformVer = hi.PlatformVersion
		s.KernelArch = hi.KernelArch
		s.KernelVersion = hi.KernelVersion
		s.UptimeSec = hi.Uptime
		s.BootTime = hi.BootTime
	} else {
		s.OS = runtime.GOOS
		s.KernelArch = runtime.GOARCH
	}

	// CPU 型号
	if infos, err := cpu.Info(); err == nil && len(infos) > 0 {
		s.CPUModel = infos[0].ModelName
		if s.NumCPU <= 0 && infos[0].Cores > 0 {
			s.NumCPU = int(infos[0].Cores)
		}
	}

	// CPU 使用率:短采样(200ms),对轮询足够且不明显阻塞
	if pcts, err := cpu.Percent(200*time.Millisecond, false); err == nil && len(pcts) > 0 {
		s.CPUUsedPct = round1(pcts[0])
	}

	if avg, err := load.Avg(); err == nil && avg != nil {
		s.Load1 = round2(avg.Load1)
		s.Load5 = round2(avg.Load5)
		s.Load15 = round2(avg.Load15)
	}

	if vm, err := mem.VirtualMemory(); err == nil && vm != nil {
		s.MemTotal = vm.Total
		s.MemUsed = vm.Used
		s.MemAvailable = vm.Available
		s.MemUsedPct = round1(vm.UsedPercent)
	}
	if sm, err := mem.SwapMemory(); err == nil && sm != nil {
		s.SwapTotal = sm.Total
		s.SwapUsed = sm.Used
		s.SwapUsedPct = round1(sm.UsedPercent)
	}

	s.Disks = collectDisks()

	if counters, err := net.IOCounters(false); err == nil && len(counters) > 0 {
		s.NetBytesSent = counters[0].BytesSent
		s.NetBytesRecv = counters[0].BytesRecv
	}

	if pids, err := psprocess.Pids(); err == nil {
		s.ProcessCount = len(pids)
	}

	return s
}

func collectDisks() []DiskUsage {
	parts, err := disk.Partitions(false)
	if err != nil || len(parts) == 0 {
		// 回退:当前盘 / Windows C: / Unix 根
		paths := []string{"."}
		if runtime.GOOS == "windows" {
			paths = []string{"C:\\"}
		} else {
			paths = []string{"/"}
		}
		out := make([]DiskUsage, 0, 1)
		for _, p := range paths {
			if u, err := disk.Usage(p); err == nil && u != nil {
				out = append(out, DiskUsage{
					Path:    u.Path,
					Total:   u.Total,
					Used:    u.Used,
					Free:    u.Free,
					UsedPct: round1(u.UsedPercent),
				})
			}
		}
		return out
	}

	seen := map[string]bool{}
	out := make([]DiskUsage, 0, len(parts))
	for _, p := range parts {
		// 跳过虚拟/重复挂载
		if p.Mountpoint == "" || seen[p.Mountpoint] {
			continue
		}
		// Windows 常见:只统计固定盘符;Unix 跳过 tmpfs 等
		fs := p.Fstype
		if runtime.GOOS != "windows" {
			switch fs {
			case "tmpfs", "devtmpfs", "proc", "sysfs", "cgroup", "cgroup2", "overlay", "squashfs":
				continue
			}
		}
		u, err := disk.Usage(p.Mountpoint)
		if err != nil || u == nil || u.Total == 0 {
			continue
		}
		seen[p.Mountpoint] = true
		out = append(out, DiskUsage{
			Path:    u.Path,
			Fstype:  fs,
			Total:   u.Total,
			Used:    u.Used,
			Free:    u.Free,
			UsedPct: round1(u.UsedPercent),
		})
		// 限制数量,避免超多挂载点
		if len(out) >= 8 {
			break
		}
	}
	return out
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// FormatBytes 人类可读字节(前端也可自行格式化,后端辅助)。
func FormatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}
