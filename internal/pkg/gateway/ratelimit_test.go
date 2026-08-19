package gateway

import (
	"sync"
	"testing"
	"time"
)

func TestRateLimiterAllowedWithinBurst(t *testing.T) {
	l := NewRateLimiter(60, 3) // 60/min, burst 3
	if !l.Enabled() {
		t.Fatal("限流应启用")
	}
	for i := 0; i < 3; i++ {
		if ok, _ := l.Allowed("1.2.3.4"); !ok {
			t.Fatalf("第 %d 次请求应放行(burst 内)", i+1)
		}
	}
	// 第 4 次应超限
	if ok, wait := l.Allowed("1.2.3.4"); ok {
		t.Fatal("超过 burst 后应被限流")
	} else if wait < 1 {
		t.Fatalf("应返回等待秒数, got %d", wait)
	}
}

func TestRateLimiterPerIPIsolated(t *testing.T) {
	l := NewRateLimiter(60, 1)
	if ok, _ := l.Allowed("1.1.1.1"); !ok {
		t.Fatal("首 IP 应放行")
	}
	if ok, _ := l.Allowed("1.1.1.1"); ok {
		t.Fatal("首 IP 第二次应限流")
	}
	if ok, _ := l.Allowed("2.2.2.2"); !ok {
		t.Fatal("不同 IP 互不影响")
	}
}

func TestRateLimiterRefill(t *testing.T) {
	base := time.Now()
	l := NewRateLimiter(60, 1) // 1 令牌/秒
	l.nowFn = func() time.Time { return base }
	if ok, _ := l.Allowed("ip"); !ok {
		t.Fatal("初始应放行")
	}
	if ok, _ := l.Allowed("ip"); ok {
		t.Fatal("用完令牌后应限流")
	}
	// 过 2 秒应回补 2 个令牌(上限 1)
	base = base.Add(2 * time.Second)
	l.nowFn = func() time.Time { return base }
	if ok, _ := l.Allowed("ip"); !ok {
		t.Fatal("回补后应放行")
	}
}

func TestRateLimiterDisabled(t *testing.T) {
	l := NewRateLimiter(0, 0)
	if l.Enabled() {
		t.Fatal("rate<=0 应禁用")
	}
	for i := 0; i < 100; i++ {
		if ok, _ := l.Allowed("any"); !ok {
			t.Fatal("禁用时全部放行")
		}
	}
	l2 := NewRateLimiter(10, 0) // burst 默认取 rate
	if l2.burst != 10 {
		t.Fatalf("burst 默认应为 rate(10), got %v", l2.burst)
	}
}

func TestRateLimiterEviction(t *testing.T) {
	base := time.Now()
	l := NewRateLimiter(60, 1)
	l.nowFn = func() time.Time { return base }
	_, _ = l.Allowed("old")
	if len(l.buckets) != 1 {
		t.Fatalf("桶应创建,got %d", len(l.buckets))
	}
	// 超过闲置 TTL 后,下一次访问触发清扫
	base = base.Add(rateLimiterIdleTTL + time.Minute)
	l.nowFn = func() time.Time { return base }
	_, _ = l.Allowed("new")
	if _, exists := l.buckets["old"]; exists {
		t.Fatal("过期桶应被清扫")
	}
	if _, exists := l.buckets["new"]; !exists {
		t.Fatal("新桶应保留")
	}
}

func TestRateLimiterMaxBuckets(t *testing.T) {
	l := NewRateLimiter(60, 1)
	for i := 0; i < rateLimiterMaxBuckets+10; i++ {
		_, _ = l.Allowed(string(rune(i)))
	}
	if len(l.buckets) > rateLimiterMaxBuckets {
		t.Fatalf("桶数应受上限约束, got %d", len(l.buckets))
	}
}

func TestRateLimiterConcurrency(t *testing.T) {
	l := NewRateLimiter(600, 100)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				_, _ = l.Allowed("ip")
			}
		}()
	}
	wg.Wait()
}