// Package repository 是数据访问层,封装 GORM 查询,与业务逻辑解耦。
package repository

import (
	"gorm.io/gorm"

	"aluka_ops/internal/model"
)

// RuntimeRepository Runtime 的数据访问。
type RuntimeRepository struct {
	db *gorm.DB
}

// NewRuntimeRepository 构造。
func NewRuntimeRepository(db *gorm.DB) *RuntimeRepository {
	return &RuntimeRepository{db: db}
}

// List 列出全部 Runtime,按 is_default desc、id asc 排序,默认环境靠前。
func (r *RuntimeRepository) List() ([]model.Runtime, error) {
	var items []model.Runtime
	err := r.db.Order("is_default desc, id asc").Find(&items).Error
	return items, err
}

// GetByID 按 ID 查询。
func (r *RuntimeRepository) GetByID(id uint) (*model.Runtime, error) {
	var rt model.Runtime
	err := r.db.First(&rt, id).Error
	return &rt, err
}

// Create 新建。
func (r *RuntimeRepository) Create(rt *model.Runtime) error {
	return r.db.Create(rt).Error
}

// Update 保存全字段。
func (r *RuntimeRepository) Update(rt *model.Runtime) error {
	return r.db.Save(rt).Error
}

// Delete 软删除。
func (r *RuntimeRepository) Delete(id uint) error {
	return r.db.Delete(&model.Runtime{}, id).Error
}

// ClearDefaultForType 将指定类型下所有 Runtime 的 is_default 置为 false。
// 用于设置新默认时的互斥处理。
func (r *RuntimeRepository) ClearDefaultForType(t model.RuntimeType, exceptID uint) error {
	return r.db.Model(&model.Runtime{}).
		Where("type = ? AND is_default = ? AND id <> ?", t, true, exceptID).
		Update("is_default", false).Error
}

// CountDefaultForType 统计某类型当前默认数量(用于校验,正常应为 0 或 1)。
func (r *RuntimeRepository) CountDefaultForType(t model.RuntimeType) (int64, error) {
	var n int64
	err := r.db.Model(&model.Runtime{}).
		Where("type = ? AND is_default = ?", t, true).
		Count(&n).Error
	return n, err
}
