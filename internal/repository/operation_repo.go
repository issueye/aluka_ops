package repository

import (
	"gorm.io/gorm"

	"aluka_ops/internal/model"
)

// OperationRepository 操作记录数据访问。
type OperationRepository struct {
	db *gorm.DB
}

// NewOperationRepository 构造。
func NewOperationRepository(db *gorm.DB) *OperationRepository {
	return &OperationRepository{db: db}
}

// Create 创建一条操作记录。
func (r *OperationRepository) Create(op *model.Operation) error {
	return r.db.Create(op).Error
}

// Update 保存(用于更新 status/output_log/finished_at 等)。
func (r *OperationRepository) Update(op *model.Operation) error {
	return r.db.Save(op).Error
}

// GetByID 查询单条。
func (r *OperationRepository) GetByID(id uint) (*model.Operation, error) {
	var op model.Operation
	err := r.db.First(&op, id).Error
	return &op, err
}

// ListByService 按 service_id 倒序查询,limit 控制条数(默认 50)。
func (r *OperationRepository) ListByService(serviceID uint, limit int) ([]model.Operation, error) {
	if limit <= 0 {
		limit = 50
	}
	var items []model.Operation
	err := r.db.Where("service_id = ?", serviceID).
		Order("id desc").Limit(limit).Find(&items).Error
	return items, err
}

// ListAll 全局操作历史(支持可选类型/状态过滤),倒序。
func (r *OperationRepository) ListAll(opType, status string, limit int) ([]model.Operation, error) {
	if limit <= 0 {
		limit = 100
	}
	q := r.db.Model(&model.Operation{})
	if opType != "" {
		q = q.Where("type = ?", opType)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var items []model.Operation
	err := q.Order("id desc").Limit(limit).Find(&items).Error
	return items, err
}
