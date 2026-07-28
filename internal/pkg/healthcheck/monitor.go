package healthcheck

import (
	"sync"
	"time"
)

// ConfigProvider 提供需要探测的服务列表。
// 返回 map[serviceID]Config;仅应包含 running 且已启用探针的服务。
type ConfigProvider func() map[uint]Config

// Monitor 后台健康检查轮询器。
type Monitor struct {
	mu       sync.RWMutex
	results  map[uint]Result
	provider ConfigProvider
	stopCh   chan struct{}
	started  bool
}

// NewMonitor 构造。
func NewMonitor(provider ConfigProvider) *Monitor {
	return &Monitor{
		results:  make(map[uint]Result),
		provider: provider,
		stopCh:   make(chan struct{}),
	}
}

// Start 启动后台循环(幂等)。
func (m *Monitor) Start() {
	m.mu.Lock()
	if m.started {
		m.mu.Unlock()
		return
	}
	m.started = true
	m.mu.Unlock()
	go m.loop()
}

// Stop 停止。
func (m *Monitor) Stop() {
	m.mu.Lock()
	if !m.started {
		m.mu.Unlock()
		return
	}
	select {
	case <-m.stopCh:
	default:
		close(m.stopCh)
	}
	m.started = false
	m.mu.Unlock()
}

// Get 取缓存结果。
func (m *Monitor) Get(serviceID uint) (Result, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.results[serviceID]
	return r, ok
}

// GetAll 全部缓存。
func (m *Monitor) GetAll() map[uint]Result {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[uint]Result, len(m.results))
	for k, v := range m.results {
		out[k] = v
	}
	return out
}

// CheckNow 立即探测并缓存(供 status API 按需调用)。
func (m *Monitor) CheckNow(serviceID uint, cfg Config) Result {
	r := Probe(cfg)
	m.mu.Lock()
	if cfg.Enabled() {
		m.results[serviceID] = r
	} else {
		delete(m.results, serviceID)
	}
	m.mu.Unlock()
	return r
}

// Clear 清除某服务缓存(停服时调用)。
func (m *Monitor) Clear(serviceID uint) {
	m.mu.Lock()
	delete(m.results, serviceID)
	m.mu.Unlock()
}

func (m *Monitor) loop() {
	// 每秒 tick,按各服务 interval 决定是否探测
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	lastRun := map[uint]time.Time{}

	for {
		select {
		case <-m.stopCh:
			return
		case now := <-ticker.C:
			if m.provider == nil {
				continue
			}
			cfgs := m.provider()
			// 清理已不在列表中的缓存
			m.mu.Lock()
			for id := range m.results {
				if _, ok := cfgs[id]; !ok {
					delete(m.results, id)
					delete(lastRun, id)
				}
			}
			m.mu.Unlock()

			for id, cfg := range cfgs {
				interval := time.Duration(cfg.IntervalSec) * time.Second
				if interval <= 0 {
					interval = 10 * time.Second
				}
				if t, ok := lastRun[id]; ok && now.Sub(t) < interval {
					continue
				}
				lastRun[id] = now
				r := Probe(cfg)
				m.mu.Lock()
				m.results[id] = r
				m.mu.Unlock()
			}
		}
	}
}
