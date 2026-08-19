package guard

import (
	"testing"
	"time"
)

func newTestGuard() *Guard {
	conf := NewPanelConfig("", "", 5, 10*time.Minute, 15*time.Minute)
	g := NewGuard(conf)
	g.nowFn = func() time.Time { return time.Now() }
	return g
}

func TestGuardFailThenBan(t *testing.T) {
	g := newTestGuard()
	ip := "1.2.3.4"
	for i := 0; i < 4; i++ {
		if banned, _ := g.RecordFailure(ip); banned {
			t.Fatalf("第 %d 次失败不应触发封禁", i+1)
		}
	}
	banned, banFor := g.RecordFailure(ip)
	if !banned || banFor <= 0 {
		t.Fatal("第 5 次失败应触发封禁")
	}
	if banned, _ := g.IsBanned(ip); !banned {
		t.Fatal("应处于封禁期")
	}
}

func TestGuardWindowSliding(t *testing.T) {
	base := time.Now()
	g := newTestGuard()
	g.nowFn = func() time.Time { return base }
	ip := "9.9.9.9"
	_, _ = g.RecordFailure(ip) // count=1
	// 窗口过期后,计数重置
	base = base.Add(11 * time.Minute)
	g.nowFn = func() time.Time { return base }
	if banned, _ := g.RecordFailure(ip); banned {
		t.Fatal("窗口过期后不应立即触发封禁(计数已重置)")
	}
}

func TestGuardSuccessClears(t *testing.T) {
	g := newTestGuard()
	ip := "1.2.3.4"
	_, _ = g.RecordFailure(ip)
	_, _ = g.RecordFailure(ip)
	g.RecordSuccess(ip)
	if len(g.Failures()) != 0 {
		t.Fatal("成功后应清空失败计数")
	}
	// 先封禁再成功,也应解除
	conf := NewPanelConfig("", "", 2, 10*time.Minute, 15*time.Minute)
	g2 := NewGuard(conf)
	g2.nowFn = func() time.Time { return time.Now() }
	_, _ = g2.RecordFailure(ip)
	if banned, _ := g2.RecordFailure(ip); !banned {
		t.Fatal("应触发封禁")
	}
	g2.RecordSuccess(ip)
	if banned, _ := g2.IsBanned(ip); banned {
		t.Fatal("成功后应解除封禁")
	}
}

func TestGuardBanExpiry(t *testing.T) {
	base := time.Now()
	conf := NewPanelConfig("", "", 2, 10*time.Minute, 15*time.Minute)
	g := NewGuard(conf)
	g.nowFn = func() time.Time { return base }
	ip := "1.2.3.4"
	_, _ = g.RecordFailure(ip)
	if banned, _ := g.RecordFailure(ip); !banned {
		t.Fatal("应处于封禁期")
	}
	base = base.Add(16 * time.Minute)
	g.nowFn = func() time.Time { return base }
	if banned, _ := g.IsBanned(ip); banned {
		t.Fatal("封禁应已过期")
	}
}

func TestGuardUnban(t *testing.T) {
	conf := NewPanelConfig("", "", 1, 10*time.Minute, 15*time.Minute)
	g := NewGuard(conf)
	g.nowFn = func() time.Time { return time.Now() }
	if banned, _ := g.RecordFailure("x.x.x.x"); !banned {
		t.Fatal("1 次失败即应封禁")
	}
	if !g.Unban("x.x.x.x") {
		t.Fatal("Unban 应返回存在封禁")
	}
	if banned, _ := g.IsBanned("x.x.x.x"); banned {
		t.Fatal("解封后不再封禁")
	}
	if g.Unban("y.y.y.y") {
		t.Fatal("未封禁 IP 的 Unban 应返回 false")
	}
}

func TestPanelConfigApplyInvalidList(t *testing.T) {
	c := NewPanelConfig("", "", 5, 10*time.Minute, 15*time.Minute)
	if err := c.Apply("not-an-ip", "", 5, 10*time.Minute, 15*time.Minute); err == nil {
		t.Fatal("非法白名单应报错")
	}
	wl, bl := c.Lists()
	if wl != "" || bl != "" {
		t.Fatal("失败的应用不应改动原配置")
	}
}

func TestPanelConfigDefaults(t *testing.T) {
	c := NewPanelConfig("", "", 0, 0, 0)
	maxFails, window, ban := c.Values()
	if maxFails != 5 || window != 10*time.Minute || ban != 15*time.Minute {
		t.Fatalf("非法值应回退默认: %d %v %v", maxFails, window, ban)
	}
}

func TestGuardConcurrency(t *testing.T) {
	g := newTestGuard()
	done := make(chan struct{})
	for i := 0; i < 20; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			for j := 0; j < 50; j++ {
_, _ = g.RecordFailure("ip")
					_, _ = g.IsBanned("ip")
				_ = g.Bans()
				_ = g.Failures()
			}
		}()
	}
	for i := 0; i < 20; i++ {
		<-done
	}
}