package gateway

import (
	"net"
	"testing"
)

func TestBlockStatsRecordAndSnapshot(t *testing.T) {
	s := NewBlockStats()
	ip := net.ParseIP("1.2.3.4")
	s.Record(8080, ip, BlockReasonSiteACL)
	s.Record(8080, ip, BlockReasonRateLimit)
	s.Record(8080, ip, BlockReasonRateLimit)
	s.Record(8080, net.ParseIP("5.6.7.8"), BlockReasonScriptDeny)

	views := s.Snapshot(8080)
	if len(views) != 2 {
		t.Fatalf("应有 2 条统计, got %d", len(views))
	}
	var v *BlockEntryView
	for i := range views {
		if views[i].IP == "1.2.3.4" {
			v = &views[i]
		}
	}
	if v == nil {
		t.Fatal("未找到 1.2.3.4 统计")
	}
	if v.Count403 != 1 || v.Count429 != 2 {
		t.Fatalf("计数错误: 403=%d 429=%d", v.Count403, v.Count429)
	}
	if v.LastReason != BlockReasonRateLimit {
		t.Fatalf("LastReason 应为 rate_limit, got %s", v.LastReason)
	}
}

func TestBlockStatsNilIPIgnored(t *testing.T) {
	s := NewBlockStats()
	s.Record(8080, nil, BlockReasonSiteACL)
	if len(s.Snapshot(8080)) != 0 {
		t.Fatal("nil IP 不应入库")
	}
}

func TestBlockStatsReset(t *testing.T) {
	s := NewBlockStats()
	s.Record(8080, net.ParseIP("1.1.1.1"), BlockReasonSiteACL)
	s.Record(9090, net.ParseIP("2.2.2.2"), BlockReasonRateLimit)
	s.Reset(8080)
	if len(s.Snapshot(8080)) != 0 {
		t.Fatal("单端口 reset 后应清空")
	}
	if len(s.Snapshot(9090)) != 1 {
		t.Fatal("reset 不应影响其他端口")
	}
	s.Reset(0)
	if len(s.SnapshotAll()) != 0 {
		t.Fatal("全量 reset 后应清空")
	}
}

func TestBlockStatsPortIsolation(t *testing.T) {
	s := NewBlockStats()
	s.Record(1, net.ParseIP("1.1.1.1"), BlockReasonSiteACL)
	s.Record(2, net.ParseIP("1.1.1.1"), BlockReasonScriptDeny)
	all := s.SnapshotAll()
	if len(all) != 2 {
		t.Fatalf("不同端口同一 IP 应分开统计, got %d", len(all))
	}
	// 每端口快照互不影响
	if len(s.Snapshot(1)) != 1 || len(s.Snapshot(2)) != 1 {
		t.Fatal("端口维度隔离失败")
	}
}

func TestBlockStatsMaxIPCap(t *testing.T) {
	s := NewBlockStats()
	for i := 0; i < blockStatsMaxIPPerPort+5; i++ {
		s.Record(8080, net.ParseIP("10.0.0.0").To4(), BlockReasonSiteACL) // 同一 IP
	}
	for i := 0; i < blockStatsMaxIPPerPort+5; i++ {
		s.Record(8080, net.ParseIP("10.0.0.0").To4(), BlockReasonRateLimit)
	}
	// 全部同 IP,应只存在 1 条且计数累加
	if len(s.Snapshot(8080)) != 1 {
		t.Fatalf("同 IP 应聚合为一条, got %d", len(s.Snapshot(8080)))
	}
}