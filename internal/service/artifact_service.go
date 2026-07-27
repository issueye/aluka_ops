package service

import (
	"errors"
	"mime/multipart"
	"strings"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/pkg/artifact"
	"aluka_ops/internal/repository"
)

// ArtifactService 制品业务逻辑:上传、列表、删除。
// 安装(install)涉及服务状态变更,放在 ServiceService 中。
type ArtifactService struct {
	db     *gorm.DB
	repo   *repository.ArtifactRepository
	svcRepo *repository.ServiceRepository
	store  *artifact.Store
}

// NewArtifactService 构造。
func NewArtifactService(
	db *gorm.DB,
	repo *repository.ArtifactRepository,
	svcRepo *repository.ServiceRepository,
	store *artifact.Store,
) *ArtifactService {
	return &ArtifactService{db: db, repo: repo, svcRepo: svcRepo, store: store}
}

// List 列出某服务的制品。
func (s *ArtifactService) List(serviceID uint) ([]model.Artifact, error) {
	return s.repo.ListByService(serviceID)
}

// Get 查询单条。
func (s *ArtifactService) Get(serviceID, artifactID uint) (*model.Artifact, error) {
	a, err := s.repo.GetByID(artifactID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if a.ServiceID != serviceID {
		return nil, ErrNotFound
	}
	return a, nil
}

// UploadInput 上传入参。
type UploadInput struct {
	Version     string
	Description string
}

// Upload 保存上传的制品文件并落库。
// 返回创建的 Artifact 记录。
func (s *ArtifactService) Upload(serviceID uint, fh *multipart.FileHeader, in UploadInput) (*model.Artifact, error) {
	svc, err := s.svcRepo.GetByID(serviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	version := strings.TrimSpace(in.Version)
	if version == "" {
		return nil, ErrInvalidVersion
	}

	storagePath, size, checksum, filename, _, err := s.store.SaveFromUpload(fh, svc.Code, version)
	if err != nil {
		return nil, err
	}

	a := &model.Artifact{
		ServiceID:   serviceID,
		Version:     version,
		Filename:    filename,
		StoragePath: storagePath,
		Source:      "upload",
		Checksum:    checksum,
		Size:        size,
		Description: in.Description,
	}
	if err := s.repo.Create(a); err != nil {
		// 落库失败,清理已写入的磁盘文件
		_ = s.store.DeleteFile(storagePath)
		return nil, err
	}
	return a, nil
}

// Delete 删除制品(磁盘文件 + 记录)。
// 当前版本不允许删除(需先安装其他版本或卸载)。
func (s *ArtifactService) Delete(serviceID, artifactID uint) error {
	a, err := s.Get(serviceID, artifactID)
	if err != nil {
		return err
	}
	if a.IsCurrent {
		return ErrCannotDeleteCurrent
	}
	if err := s.store.DeleteFile(a.StoragePath); err != nil {
		return err
	}
	return s.repo.Delete(artifactID)
}

// ErrInvalidVersion 版本号无效。
var ErrInvalidVersion = errors.New("版本号不能为空")

// ErrCannotDeleteCurrent 不能删除当前版本。
var ErrCannotDeleteCurrent = errors.New("当前版本制品不能删除,请先卸载或安装其他版本")

// ErrArtifactNotInstalled 制品尚未安装。
var ErrArtifactNotInstalled = errors.New("制品尚未安装,无法启动")
