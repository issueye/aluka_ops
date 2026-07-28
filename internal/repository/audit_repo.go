package repository

import (
	"gorm.io/gorm"

	"aluka_ops/internal/model"
)

// AuditRepository 审计日志数据访问。
type AuditRepository struct {
	db *gorm.DB
}

// NewAuditRepository 构造。
func NewAuditRepository(db *gorm.DB) *AuditRepository {
	return &AuditRepository{db: db}
}

// Create 写入一条审计日志。
func (r *AuditRepository) Create(log *model.AuditLog) error {
	return r.db.Create(log).Error
}

// List 查询审计日志(倒序)。
func (r *AuditRepository) List(action, targetType string, limit int) ([]model.AuditLog, error) {
	if limit <= 0 {
		limit = 100
	}
	q := r.db.Model(&model.AuditLog{})
	if action != "" {
		q = q.Where("action = ?", action)
	}
	if targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	var items []model.AuditLog
	err := q.Order("id desc").Limit(limit).Find(&items).Error
	return items, err
}

// GetByID 按 ID 查询。
func (r *AuditRepository) GetByID(id uint) (*model.AuditLog, error) {
	var log model.AuditLog
	err := r.db.First(&log, id).Error
	return &log, err
}
