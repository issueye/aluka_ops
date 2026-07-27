// Package service 是业务逻辑层,封装跨 repository 的规则与事务。
package service

import (
	"errors"
	"strings"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/repository"
)

// RuntimeService Runtime 业务逻辑。
type RuntimeService struct {
	repo *repository.RuntimeRepository
	db   *gorm.DB
}

// NewRuntimeService 构造。db 用于事务(互斥默认环境)。
func NewRuntimeService(db *gorm.DB, repo *repository.RuntimeRepository) *RuntimeService {
	return &RuntimeService{repo: repo, db: db}
}

// List 列出全部。
func (s *RuntimeService) List() ([]model.Runtime, error) {
	return s.repo.List()
}

// GetByID 查询;不存在返回 ErrNotFound。
func (s *RuntimeService) GetByID(id uint) (*model.Runtime, error) {
	rt, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return rt, nil
}

// CreateInput 创建入参。
type CreateRuntimeInput struct {
	Name        string             `json:"name"        binding:"required"`
	Type        model.RuntimeType  `json:"type"`
	Version     string             `json:"version"`
	InstallPath string             `json:"install_path"`
	IsDefault   bool               `json:"is_default"`
	EnvTemplate string             `json:"env_template"`
	Description string             `json:"description"`
}

// Create 新建 Runtime。若 IsDefault=true,事务内清空同类型其他默认。
func (s *RuntimeService) Create(in CreateRuntimeInput) (*model.Runtime, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, ErrInvalidName
	}
	t := in.Type
	if t == "" {
		t = model.RuntimeTypeJDK
	}

	rt := &model.Runtime{
		Name:        name,
		Type:        t,
		Version:     in.Version,
		InstallPath: in.InstallPath,
		IsDefault:   in.IsDefault,
		EnvTemplate: in.EnvTemplate,
		Description: in.Description,
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if in.IsDefault {
			if err := tx.Model(&model.Runtime{}).
				Where("type = ? AND is_default = ?", t, true).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}
		return tx.Create(rt).Error
	})
	if err != nil {
		return nil, err
	}
	return rt, nil
}

// UpdateRuntimeInput 更新入参。
type UpdateRuntimeInput struct {
	Name        *string            `json:"name"`
	Type        *model.RuntimeType `json:"type"`
	Version     *string            `json:"version"`
	InstallPath *string            `json:"install_path"`
	IsDefault   *bool              `json:"is_default"`
	EnvTemplate *string            `json:"env_template"`
	Description *string            `json:"description"`
}

// Update 全量更新(指针为 nil 表示不改)。
func (s *RuntimeService) Update(id uint, in UpdateRuntimeInput) (*model.Runtime, error) {
	rt, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, ErrInvalidName
		}
		rt.Name = name
	}
	if in.Type != nil {
		rt.Type = *in.Type
	}
	if in.Version != nil {
		rt.Version = *in.Version
	}
	if in.InstallPath != nil {
		rt.InstallPath = *in.InstallPath
	}
	if in.EnvTemplate != nil {
		rt.EnvTemplate = *in.EnvTemplate
	}
	if in.Description != nil {
		rt.Description = *in.Description
	}
	if in.IsDefault != nil {
		rt.IsDefault = *in.IsDefault
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		// 若设为默认,先清空同类型其他默认(排除自身)。
		if in.IsDefault != nil && *in.IsDefault {
			if err := tx.Model(&model.Runtime{}).
				Where("type = ? AND is_default = ? AND id <> ?", rt.Type, true, id).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}
		return tx.Save(rt).Error
	})
	if err != nil {
		return nil, err
	}
	return rt, nil
}

// Delete 删除 Runtime。
func (s *RuntimeService) Delete(id uint) error {
	if _, err := s.GetByID(id); err != nil {
		return err
	}
	return s.repo.Delete(id)
}
