package repository

import (
	"aluka_ops/internal/model"

	"gorm.io/gorm"
)

// TunnelRepository 隧道规则。
type TunnelRepository struct{ db *gorm.DB }

func NewTunnelRepository(db *gorm.DB) *TunnelRepository {
	return &TunnelRepository{db: db}
}

func (r *TunnelRepository) List() ([]model.TunnelRule, error) {
	var list []model.TunnelRule
	err := r.db.Order("listen_port asc, id asc").Find(&list).Error
	return list, err
}

func (r *TunnelRepository) ListEnabled() ([]model.TunnelRule, error) {
	var list []model.TunnelRule
	err := r.db.Where("enabled = ?", true).Order("listen_port asc").Find(&list).Error
	return list, err
}

func (r *TunnelRepository) GetByID(id uint) (*model.TunnelRule, error) {
	var m model.TunnelRule
	if err := r.db.First(&m, id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *TunnelRepository) GetByCode(code string) (*model.TunnelRule, error) {
	var m model.TunnelRule
	if err := r.db.Where("code = ?", code).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *TunnelRepository) GetByListenPort(port int) (*model.TunnelRule, error) {
	var m model.TunnelRule
	if err := r.db.Where("listen_port = ?", port).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *TunnelRepository) Create(m *model.TunnelRule) error { return r.db.Create(m).Error }
func (r *TunnelRepository) Update(m *model.TunnelRule) error { return r.db.Save(m).Error }
func (r *TunnelRepository) Delete(id uint) error             { return r.db.Delete(&model.TunnelRule{}, id).Error }
