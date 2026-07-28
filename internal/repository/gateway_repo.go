package repository

import (
	"aluka_ops/internal/model"

	"gorm.io/gorm"
)

// GatewayRepository 网关规则持久化。
type GatewayRepository struct {
	db *gorm.DB
}

func NewGatewayRepository(db *gorm.DB) *GatewayRepository {
	return &GatewayRepository{db: db}
}

func (r *GatewayRepository) List() ([]model.GatewayRule, error) {
	var list []model.GatewayRule
	err := r.db.Order("listen_port asc, length(path_prefix) desc, sort asc, id asc").Find(&list).Error
	return list, err
}

func (r *GatewayRepository) ListEnabled() ([]model.GatewayRule, error) {
	var list []model.GatewayRule
	err := r.db.Where("enabled = ?", true).
		Order("listen_port asc, length(path_prefix) desc, sort asc, id asc").
		Find(&list).Error
	return list, err
}

func (r *GatewayRepository) GetByID(id uint) (*model.GatewayRule, error) {
	var m model.GatewayRule
	if err := r.db.First(&m, id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *GatewayRepository) GetByCode(code string) (*model.GatewayRule, error) {
	var m model.GatewayRule
	if err := r.db.Where("code = ?", code).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *GatewayRepository) Create(m *model.GatewayRule) error {
	return r.db.Create(m).Error
}

func (r *GatewayRepository) Update(m *model.GatewayRule) error {
	return r.db.Save(m).Error
}

func (r *GatewayRepository) Delete(id uint) error {
	return r.db.Delete(&model.GatewayRule{}, id).Error
}

// ListEnabledByPort 某端口下启用的规则(最长前缀优先)。
func (r *GatewayRepository) ListEnabledByPort(port int) ([]model.GatewayRule, error) {
	var list []model.GatewayRule
	err := r.db.Where("enabled = ? AND listen_port = ?", true, port).
		Order("length(path_prefix) desc, sort asc, id asc").
		Find(&list).Error
	return list, err
}
