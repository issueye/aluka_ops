// 站点级请求限流:每客户端 IP 独立令牌桶。
//
// 令牌按 rate(令牌/秒)补充、以 burst 为容量,每个请求消耗 1 个令牌;
// 令牌不足时返回 429 与建议等待秒数。桶表惰性创建、定期淘汰,防止内存膨胀。
package gateway

import (
	"math"
	"sync"
	"time"
)

const (
	rateLimiterMaxBuckets = 50000   // 单端口 IP 桶数上限
	rateLimiterIdleTTL    = 15 * time.Minute // 闲置超过该时长即淘汰
	rateLimiterSweepEvery = time.Minute      // 全量清扫的最小间隔
)

// RateLimiter 按 IP 计数的令牌桶限流器。
type RateLimiter struct {
	mu        sync.Mutex
	rate      float64 // 令牌/秒
	burst     float64 // 桶容量
	nowFn     func() time.Time
	buckets   map[string]*rateBucket
	nextSweep time.Time
}

type rateBucket struct {
	tokens  float64
	updated time.Time
}

// NewRateLimiter 构造。ratePerMin<=0 表示不限流(Enabled 返回 false);
// burst<=0 时取 ratePerMin(即默认突发等于一分钟配额)。
func NewRateLimiter(ratePerMin, burst int) *RateLimiter {
	if ratePerMin <= 0 {
		return &RateLimiter{nowFn: time.Now}
	}
	if burst <= 0 {
		burst = ratePerMin
	}
	return &RateLimiter{
		rate:      float64(ratePerMin) / 60.0,
		burst:     float64(burst),
		nowFn:     time.Now,
		buckets:   make(map[string]*rateBucket),
		nextSweep: time.Now().Add(rateLimiterSweepEvery),
	}
}

// Enabled 是否启用了限流。
func (l *RateLimiter) Enabled() bool { return l != nil && l.rate > 0 }

// Allowed 尝试消耗 1 个令牌。允许时返回 true;超限时返回 false 与建议等待秒数。
func (l *RateLimiter) Allowed(ip string) (ok bool, waitSec int) {
	if !l.Enabled() {
		return true, 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.nowFn()
	if now.After(l.nextSweep) {
		l.sweepLocked(now)
		l.nextSweep = now.Add(rateLimiterSweepEvery)
	}
	b, ok := l.buckets[ip]
	if !ok {
		if len(l.buckets) >= rateLimiterMaxBuckets {
			l.evictOldestLocked()
		}
		b = &rateBucket{tokens: l.burst, updated: now}
		l.buckets[ip] = b
	}
	b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.updated).Seconds()*l.rate)
	b.updated = now
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	waitSec = int(math.Ceil((1 - b.tokens) / l.rate))
	if waitSec < 1 {
		waitSec = 1
	}
	return false, waitSec
}

func (l *RateLimiter) sweepLocked(now time.Time) {
	for ip, b := range l.buckets {
		if now.Sub(b.updated) > rateLimiterIdleTTL {
			delete(l.buckets, ip)
		}
	}
}

func (l *RateLimiter) evictOldestLocked() {
	var oldestKey string
	var oldest time.Time
	for ip, b := range l.buckets {
		if oldestKey == "" || b.updated.Before(oldest) {
			oldestKey, oldest = ip, b.updated
		}
	}
	if oldestKey != "" {
		delete(l.buckets, oldestKey)
	}
}