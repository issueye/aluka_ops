package repository

import (
	"gorm.io/gorm"

	"aluka_ops/internal/model"
)

// TemplateRepository 服务模板数据访问。
type TemplateRepository struct {
	db *gorm.DB
}

// NewTemplateRepository 构造。
func NewTemplateRepository(db *gorm.DB) *TemplateRepository {
	return &TemplateRepository{db: db}
}

// List 全部模板。
func (r *TemplateRepository) List() ([]model.Template, error) {
	var items []model.Template
	err := r.db.Order("id asc").Find(&items).Error
	return items, err
}

// GetByID 按 ID 查询。
func (r *TemplateRepository) GetByID(id uint) (*model.Template, error) {
	var t model.Template
	err := r.db.First(&t, id).Error
	return &t, err
}

// Create 新建。
func (r *TemplateRepository) Create(t *model.Template) error {
	return r.db.Create(t).Error
}

// Update 保存。
func (r *TemplateRepository) Update(t *model.Template) error {
	return r.db.Save(t).Error
}

// Delete 删除。
func (r *TemplateRepository) Delete(id uint) error {
	return r.db.Delete(&model.Template{}, id).Error
}
