// Package db 封装 GORM/SQLite 的初始化、迁移与种子数据。
package db

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"aluka_ops/internal/model"
)

// Open 打开/创建 SQLite 数据库并对所有模型执行 AutoMigrate 与种子初始化。
// 使用纯 Go 驱动 modernc(经 glebarez 适配 GORM),无需 CGO。
func Open(dbPath string) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("创建数据库目录失败: %w", err)
	}

	// DSN:启用外键、WAL、忙等待,缓解并发读写锁。
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)", dbPath)
	gormDB, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger:      logger.Default.LogMode(logger.Warn),
		PrepareStmt: true,
	})
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	// 连接池调优:SQLite 写串行,单连接即可。
	if sqlDB, err := gormDB.DB(); err == nil {
		sqlDB.SetMaxOpenConns(1)
		sqlDB.SetMaxIdleConns(1)
		sqlDB.SetConnMaxLifetime(0)
	}

	if err := autoMigrate(gormDB); err != nil {
		return nil, fmt.Errorf("数据库迁移失败: %w", err)
	}
	if err := seed(gormDB); err != nil {
		return nil, fmt.Errorf("种子数据初始化失败: %w", err)
	}
	return gormDB, nil
}

// allModels 返回需要迁移的全部模型。集中一处,后续仅在此追加新模型。
func allModels() []any {
	return []any{
			&model.Node{},
			&model.Runtime{},
			&model.Service{},
			&model.ServiceConfig{},
			&model.Artifact{},
			&model.Template{},
			&model.Operation{},
			&model.AuditLog{},
			&model.Setting{},
			&model.GatewayRule{}, // 旧扁平规则表,保留兼容
			&model.GatewayPort{},
			&model.App{},
&model.PortProxyRule{},
				&model.PortRouteScript{},
				&model.TunnelRule{},
			}
	}

func autoMigrate(gormDB *gorm.DB) error {
	return gormDB.AutoMigrate(allModels()...)
}

// seed 写入系统启动所需的初始数据:
//   - 本地节点 local(单机版唯一节点)
//   - 一个默认占位 JDK(标记为默认),便于首版直接被服务绑定/演示
//
// 已存在的数据不会被覆盖。
func seed(gormDB *gorm.DB) error {
	// 1) 本地节点
	var nodeCount int64
	gormDB.Model(&model.Node{}).Where("code = ?", "local").Count(&nodeCount)
	if nodeCount == 0 {
		host, _ := os.Hostname()
		localNode := model.Node{
			Code:        "local",
			Name:        "本机节点",
			Host:        host,
			OS:          runtime.GOOS,
			Status:      "online",
			IsLocal:     true,
			Description: "Aluka Ops 所在的本机节点",
		}
		now := time.Now()
		localNode.LastSeenAt = &now
		if err := gormDB.Create(&localNode).Error; err != nil {
			return err
		}
	}

	// 2) 默认占位 JDK:install_path 留空,用户可在环境管理页填入真实路径。
	var defJDK int64
	gormDB.Model(&model.Runtime{}).Where("type = ? AND is_default = ?", model.RuntimeTypeJDK, true).Count(&defJDK)
	if defJDK == 0 {
		defaultJDK := model.Runtime{
			Name:        "JDK(请编辑)",
			Type:        model.RuntimeTypeJDK,
			Version:     "",
			InstallPath: "",
			IsDefault:   true,
			EnvTemplate: `{"JAVA_HOME":"{{install_path}}","PATH":"{{install_path}}\\bin;{{PATH}}"}`,
			Description: "系统初始化的默认 JDK 占位,请在环境管理中填入真实安装路径",
		}
		if err := gormDB.Create(&defaultJDK).Error; err != nil {
			return err
		}
	}
	return nil
}
