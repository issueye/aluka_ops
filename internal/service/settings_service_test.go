package service

import (
	"errors"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/pkg/guard"
	"aluka_ops/internal/repository"
)

func newTestPanelService(t *testing.T) (*PanelSettingsService, *guard.PanelConfig, *guard.Guard) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	if err := db.AutoMigrate(&model.Setting{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	conf := guard.NewPanelConfig("", "", 5, 10*time.Minute, 15*time.Minute)
	g := guard.NewGuard(conf)
	svc := NewPanelSettingsService(repository.NewSettingRepository(db), conf)
	return svc, conf, g
}

func TestPanelSettingsGetDefaults(t *testing.T) {
	svc, _, _ := newTestPanelService(t)
	out, err := svc.Get()
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if out.MaxFails != 5 || out.WindowSec != 600 || out.BanSec != 900 {
		t.Fatalf("默认值错误: %+v", out)
	}
}

func TestPanelSettingsUpdatePersistsAndHotApplies(t *testing.T) {
	svc, conf, _ := newTestPanelService(t)
	wl := "10.0.0.0/8"
	fails := 3
	out, err := svc.Update(PanelSettingsUpdate{
		IPWhitelist: &wl,
		MaxFails:    &fails,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if out.IPWhitelist != wl || out.MaxFails != 3 {
		t.Fatalf("返回值错误: %+v", out)
	}
	// 内存热生效
	gotWL, _ := conf.Lists()
	if gotWL != wl {
		t.Fatalf("内存白名单应更新, got %q", gotWL)
	}
	// 持久化
	got, err := svc.Get()
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.IPWhitelist != wl || got.MaxFails != 3 {
		t.Fatalf("DB 值应持久化: %+v", got)
	}
}

func TestPanelSettingsUpdateInvalidList(t *testing.T) {
	svc, conf, _ := newTestPanelService(t)
	bad := "not-an-ip"
	_, err := svc.Update(PanelSettingsUpdate{IPWhitelist: &bad})
	if !errors.Is(err, ErrPanelInvalid) {
		t.Fatalf("非法白名单应返回 ErrPanelInvalid, got %v", err)
	}
	wl, _ := conf.Lists()
	if wl != "" {
		t.Fatalf("配置不应被改动, got %q", wl)
	}
}

func TestPanelSettingsUpdateInvalidRange(t *testing.T) {
	svc, _, _ := newTestPanelService(t)
	bad := 0
	if _, err := svc.Update(PanelSettingsUpdate{MaxFails: &bad}); !errors.Is(err, ErrPanelInvalid) {
		t.Fatalf("非法阈值应报错, got %v", err)
	}
	tooBig := 10000
	if _, err := svc.Update(PanelSettingsUpdate{MaxFails: &tooBig}); !errors.Is(err, ErrPanelInvalid) {
		t.Fatalf("超上限阈值应报错, got %v", err)
	}
}

func TestPanelSettingsPartialUpdate(t *testing.T) {
	svc, _, _ := newTestPanelService(t)
	wl := "192.168.1.0/24"
	if _, err := svc.Update(PanelSettingsUpdate{IPWhitelist: &wl}); err != nil {
		t.Fatalf("update: %v", err)
	}
	bl := "192.168.1.99"
	if _, err := svc.Update(PanelSettingsUpdate{IPBlacklist: &bl}); err != nil {
		t.Fatalf("update2: %v", err)
	}
	out, err := svc.Get()
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if out.IPWhitelist != wl || out.IPBlacklist != bl {
		t.Fatalf("部分更新应保留已有字段: %+v", out)
	}
}