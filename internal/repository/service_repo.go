package repository

import (
	"gorm.io/gorm"

	"aluka_ops/internal/model"
)

// ServiceRepository Service 与 ServiceConfig 的数据访问。
// 配置随服务一起管理(1:N,仅 is_current 那条生效),因此合并于此。
type ServiceRepository struct {
	db *gorm.DB
}

// NewServiceRepository 构造。
func NewServiceRepository(db *gorm.DB) *ServiceRepository {
	return &ServiceRepository{db: db}
}

// ListFilter 列表筛选条件。空值表示不过滤。
type ListFilter struct {
	Name   string // 模糊匹配 name/code
	Status string // 精确匹配 status
	Type   string // 精确匹配 type
}

// List 列出服务,附带 Runtime 名称(便于前端直接展示)。
func (r *ServiceRepository) List(f ListFilter) ([]model.Service, error) {
	q := r.db.Model(&model.Service{})
	if f.Name != "" {
		like := "%" + f.Name + "%"
		q = q.Where("name LIKE ? OR code LIKE ?", like, like)
	}
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	if f.Type != "" {
		q = q.Where("type = ?", f.Type)
	}
	var items []model.Service
	err := q.Order("id desc").Find(&items).Error
	return items, err
}

// GetByID 按 ID 查询。
func (r *ServiceRepository) GetByID(id uint) (*model.Service, error) {
	var s model.Service
	err := r.db.First(&s, id).Error
	return &s, err
}

// GetDetail 查询详情并预加载 Runtime。
func (r *ServiceRepository) GetDetail(id uint) (*model.Service, error) {
	var s model.Service
	err := r.db.First(&s, id).Error
	if err == nil {
		if s.RuntimeID != nil {
			var rt model.Runtime
			if e := r.db.First(&rt, *s.RuntimeID).Error; e == nil {
				// Service 结构无 Runtime 字段;详情通过 map 补,见 service 层
			}
		}
	}
	return &s, err
}

// GetRuntime 按 ID 查 Runtime(供 service 层组装详情)。
func (r *ServiceRepository) GetRuntime(id uint) (*model.Runtime, error) {
	var rt model.Runtime
	err := r.db.First(&rt, id).Error
	return &rt, err
}

// Create 创建服务记录。
func (r *ServiceRepository) Create(s *model.Service) error {
	return r.db.Create(s).Error
}

// Update 保存全字段。
func (r *ServiceRepository) Update(s *model.Service) error {
	return r.db.Save(s).Error
}

// UpdateStatus 仅更新状态相关字段(避免覆盖其他并发修改)。
func (r *ServiceRepository) UpdateStatus(id uint, status model.ServiceStatus, pid int, startedAt *interface{}) error {
	updates := map[string]any{
		"status": status,
		"pid":    pid,
	}
	if startedAt != nil {
		updates["started_at"] = *startedAt
	}
	return r.db.Model(&model.Service{}).Where("id = ?", id).Updates(updates).Error
}

// Delete 删除服务。
func (r *ServiceRepository) Delete(id uint) error {
	return r.db.Delete(&model.Service{}, id).Error
}

// ===== ServiceConfig =====

// GetCurrentConfig 取当前生效配置(is_current=true)。
func (r *ServiceRepository) GetCurrentConfig(serviceID uint) (*model.ServiceConfig, error) {
	var cfg model.ServiceConfig
	err := r.db.Where("service_id = ? AND is_current = ?", serviceID, true).First(&cfg).Error
	return &cfg, err
}

// CreateConfig 新建配置记录。
func (r *ServiceRepository) CreateConfig(cfg *model.ServiceConfig) error {
	return r.db.Create(cfg).Error
}

// UpdateConfig 保存配置全字段。
func (r *ServiceRepository) UpdateConfig(cfg *model.ServiceConfig) error {
	return r.db.Save(cfg).Error
}

// SetCurrentConfig 将某配置设为当前(事务:清除该服务其他 current → 标记本条)。
func (r *ServiceRepository) SetCurrentConfig(serviceID, configID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.ServiceConfig{}).
			Where("service_id = ?", serviceID).
			Update("is_current", false).Error; err != nil {
			return err
		}
		return tx.Model(&model.ServiceConfig{}).
			Where("id = ?", configID).
			Update("is_current", true).Error
	})
}
