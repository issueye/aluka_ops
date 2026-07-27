package repository

import (
	"gorm.io/gorm"

	"aluka_ops/internal/model"
)

// ArtifactRepository 制品数据访问。
type ArtifactRepository struct {
	db *gorm.DB
}

// NewArtifactRepository 构造。
func NewArtifactRepository(db *gorm.DB) *ArtifactRepository {
	return &ArtifactRepository{db: db}
}

// ListByService 列出某服务的全部制品,当前版本优先,按 id desc。
func (r *ArtifactRepository) ListByService(serviceID uint) ([]model.Artifact, error) {
	var items []model.Artifact
	err := r.db.Where("service_id = ?", serviceID).
		Order("is_current desc, id desc").Find(&items).Error
	return items, err
}

// GetByID 查询。
func (r *ArtifactRepository) GetByID(id uint) (*model.Artifact, error) {
	var a model.Artifact
	err := r.db.First(&a, id).Error
	return &a, err
}

// Create 新建。
func (r *ArtifactRepository) Create(a *model.Artifact) error {
	return r.db.Create(a).Error
}

// Update 保存。
func (r *ArtifactRepository) Update(a *model.Artifact) error {
	return r.db.Save(a).Error
}

// Delete 删除。
func (r *ArtifactRepository) Delete(id uint) error {
	return r.db.Delete(&model.Artifact{}, id).Error
}

// ClearCurrent 清除某服务下所有制品的 is_current 标记(用于安装新版本时互斥)。
func (r *ArtifactRepository) ClearCurrent(serviceID uint, exceptID uint) error {
	q := r.db.Model(&model.Artifact{}).Where("service_id = ? AND is_current = ?", serviceID, true)
	if exceptID > 0 {
		q = q.Where("id <> ?", exceptID)
	}
	return q.Update("is_current", false).Error
}

// SetCurrent 标记某制品为当前版本(事务:清其他 → 标本条)。
func (r *ArtifactRepository) SetCurrent(serviceID, artifactID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Artifact{}).
			Where("service_id = ?", serviceID).
			Update("is_current", false).Error; err != nil {
			return err
		}
		return tx.Model(&model.Artifact{}).
			Where("id = ?", artifactID).
			Update("is_current", true).Error
	})
}

// CountByService 该服务的制品数量。
func (r *ArtifactRepository) CountByService(serviceID uint) (int64, error) {
	var n int64
	err := r.db.Model(&model.Artifact{}).Where("service_id = ?", serviceID).Count(&n).Error
	return n, err
}
