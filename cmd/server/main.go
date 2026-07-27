// Package main 是 Aluka Ops 后端入口。
//
// 启动流程:加载配置 → 打开/迁移数据库 → 组装路由 → 监听 HTTP。
//
// 运行:
//
//	go run cmd/server/main.go
//
// 可用环境变量见 internal/config/config.go(ALUKA_PORT / ALUKA_DATA_DIR / ALUKA_MODE)。
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"aluka_ops/internal/config"
	"aluka_ops/internal/controller"
	"aluka_ops/internal/pkg/db"
	"aluka_ops/internal/pkg/process"
	"aluka_ops/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	gormDB, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("初始化数据库失败: %v", err)
	}
	defer func() {
		if sqlDB, err := gormDB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}()

	log.Printf("Aluka Ops %s 启动中(模式: %s)", controller.AppVersion, cfg.Mode)
	log.Printf("数据库: %s", cfg.DBPath)

	// 进程管理器单例:管理所有被拉起的服务进程。
	procs := process.NewManager()

	engine := router.New(gormDB, cfg, procs)
	srv := &http.Server{
		Addr:              cfg.HTTPAddr(),
		Handler:           engine,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// 异步监听。
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP 监听失败: %v", err)
		}
	}()

	log.Printf("HTTP 监听: http://localhost%s", cfg.HTTPAddr())
	log.Printf("健康检查: http://localhost%s/api/health", cfg.HTTPAddr())

	// 优雅关闭。
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Printf("正在关闭...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("强制关闭: %v", err)
	}
	log.Printf("Aluka Ops 已停止")
}
