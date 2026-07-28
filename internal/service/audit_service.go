package service

import (
	"encoding/json"
	"errors"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/repository"
)

// AuditService 审计日志业务。
type AuditService struct {
	repo *repository.AuditRepository
}

// NewAuditService 构造。
func NewAuditService(repo *repository.AuditRepository) *AuditService {
	return &AuditService{repo: repo}
}

// Write 写入审计日志(异步调用方也可同步调用,体积小)。
func (s *AuditService) Write(action, targetType string, targetID uint, operator, detail string) {
	if s == nil || s.repo == nil {
		return
	}
	_ = s.repo.Create(&model.AuditLog{
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Operator:   operator,
		Detail:     detail,
	})
}

// WriteJSON 将 detail 序列化为 JSON 后写入。
func (s *AuditService) WriteJSON(action, targetType string, targetID uint, operator string, detail any) {
	b, err := json.Marshal(detail)
	if err != nil {
		s.Write(action, targetType, targetID, operator, "")
		return
	}
	s.Write(action, targetType, targetID, operator, string(b))
}

// List 查询。
func (s *AuditService) List(action, targetType string, limit int) ([]model.AuditLog, error) {
	return s.repo.List(action, targetType, limit)
}

// Get 单条。
func (s *AuditService) Get(id uint) (*model.AuditLog, error) {
	log, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return log, nil
}
