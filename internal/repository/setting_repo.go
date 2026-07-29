package repository

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"aluka_ops/internal/model"
)

// SettingRepository 全局键值设置。
type SettingRepository struct{ db *gorm.DB }

func NewSettingRepository(db *gorm.DB) *SettingRepository {
	return &SettingRepository{db: db}
}

func (r *SettingRepository) Get(key string) (string, bool) {
	var m model.Setting
	if err := r.db.First(&m, "`key` = ?", key).Error; err != nil {
		return "", false
	}
	return m.Value, true
}

func (r *SettingRepository) GetMany(keys []string) map[string]string {
	out := make(map[string]string, len(keys))
	if len(keys) == 0 {
		return out
	}
	var list []model.Setting
	_ = r.db.Where("`key` IN ?", keys).Find(&list).Error
	for _, m := range list {
		out[m.Key] = m.Value
	}
	return out
}

func (r *SettingRepository) Set(key, value string) error {
	m := model.Setting{
		Key:       key,
		Value:     value,
		UpdatedAt: time.Now(),
	}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&m).Error
}

func (r *SettingRepository) SetMany(kv map[string]string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for k, v := range kv {
			m := model.Setting{Key: k, Value: v, UpdatedAt: time.Now()}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "key"}},
				DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
			}).Create(&m).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *SettingRepository) Delete(key string) error {
	return r.db.Where("`key` = ?", key).Delete(&model.Setting{}).Error
}
