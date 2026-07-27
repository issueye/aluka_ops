package controller

import (
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"aluka_ops/internal/config"
)

// AppVersion 应用版本号(后续可由 ldflags 注入)。
const AppVersion = "0.1.0-m1"

// HealthController 健康检查与系统信息。
type HealthController struct {
	db  *gorm.DB
	cfg *config.Config
}

// NewHealthController 构造。
func NewHealthController(db *gorm.DB, cfg *config.Config) *HealthController {
	return &HealthController{db: db, cfg: cfg}
}

// Health GET /api/health
// 返回版本、运行模式、数据库连通性、主机名等。
func (h *HealthController) Health(c *gin.Context) {
	dbOK := "ok"
	if sqlDB, err := h.db.DB(); err == nil {
		if err := sqlDB.Ping(); err != nil {
			dbOK = "error: " + err.Error()
		}
	} else {
		dbOK = "unavailable"
	}

	hostName, _ := os.Hostname()
	OK(c, gin.H{
		"app":       "aluka-ops",
		"version":   AppVersion,
		"mode":      h.cfg.Mode,
		"db":        dbOK,
		"host":      hostName,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}
