package repository

import (
	"aluka_ops/internal/model"

	"gorm.io/gorm"
)

// GatewayPortRepository 代理端口。
type GatewayPortRepository struct{ db *gorm.DB }

func NewGatewayPortRepository(db *gorm.DB) *GatewayPortRepository {
	return &GatewayPortRepository{db: db}
}

func (r *GatewayPortRepository) List() ([]model.GatewayPort, error) {
	var list []model.GatewayPort
	err := r.db.
		Preload("Apps", func(db *gorm.DB) *gorm.DB {
			return db.Order("length(path_prefix) desc, id asc")
		}).
		Preload("Proxies", func(db *gorm.DB) *gorm.DB {
			return db.Order("length(path_prefix) desc, sort asc, id asc")
		}).
		Preload("Scripts", func(db *gorm.DB) *gorm.DB {
			return db.Order("priority asc, id asc")
		}).
		Order("port asc").Find(&list).Error
	return list, err
}

func (r *GatewayPortRepository) ListSimple() ([]model.GatewayPort, error) {
	var list []model.GatewayPort
	err := r.db.Order("port asc").Find(&list).Error
	return list, err
}

func (r *GatewayPortRepository) GetByID(id uint) (*model.GatewayPort, error) {
	var m model.GatewayPort
	err := r.db.
		Preload("Apps", func(db *gorm.DB) *gorm.DB {
			return db.Order("length(path_prefix) desc, id asc")
		}).
		Preload("Proxies", func(db *gorm.DB) *gorm.DB {
			return db.Order("length(path_prefix) desc, sort asc, id asc")
		}).
		Preload("Scripts", func(db *gorm.DB) *gorm.DB {
			return db.Order("priority asc, id asc")
		}).
		First(&m, id).Error
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *GatewayPortRepository) GetByPort(port int) (*model.GatewayPort, error) {
	var m model.GatewayPort
	if err := r.db.Where("port = ?", port).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *GatewayPortRepository) Create(m *model.GatewayPort) error { return r.db.Create(m).Error }
func (r *GatewayPortRepository) Update(m *model.GatewayPort) error { return r.db.Save(m).Error }

func (r *GatewayPortRepository) Delete(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("port_id = ?", id).Delete(&model.App{}).Error; err != nil {
			return err
		}
		if err := tx.Where("port_id = ?", id).Delete(&model.PortProxyRule{}).Error; err != nil {
			return err
		}
		if err := tx.Where("port_id = ?", id).Delete(&model.PortRouteScript{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.GatewayPort{}, id).Error
	})
}

// AppRepository 前端 APP(静态站)。
type AppRepository struct{ db *gorm.DB }

func NewAppRepository(db *gorm.DB) *AppRepository { return &AppRepository{db: db} }

func (r *AppRepository) List() ([]model.App, error) {
	var list []model.App
	err := r.db.Preload("Port").Order("id desc").Find(&list).Error
	return list, err
}

func (r *AppRepository) GetByID(id uint) (*model.App, error) {
	var m model.App
	if err := r.db.Preload("Port").First(&m, id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *AppRepository) GetByCode(code string) (*model.App, error) {
	var m model.App
	if err := r.db.Where("code = ?", code).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *AppRepository) Create(m *model.App) error { return r.db.Create(m).Error }
func (r *AppRepository) Update(m *model.App) error { return r.db.Save(m).Error }
func (r *AppRepository) Delete(id uint) error {
	return r.db.Delete(&model.App{}, id).Error
}

func (r *AppRepository) CountByPort(portID uint) (int64, error) {
	var n int64
	err := r.db.Model(&model.App{}).Where("port_id = ?", portID).Count(&n).Error
	return n, err
}

// PortProxyRepository 端口下反代规则。
type PortProxyRepository struct{ db *gorm.DB }

func NewPortProxyRepository(db *gorm.DB) *PortProxyRepository {
	return &PortProxyRepository{db: db}
}

func (r *PortProxyRepository) List() ([]model.PortProxyRule, error) {
	var list []model.PortProxyRule
	err := r.db.Preload("Port").
		Order("port_id asc, length(path_prefix) desc, sort asc, id asc").
		Find(&list).Error
	return list, err
}

func (r *PortProxyRepository) ListByPort(portID uint) ([]model.PortProxyRule, error) {
	var list []model.PortProxyRule
	err := r.db.Where("port_id = ?", portID).
		Order("length(path_prefix) desc, sort asc, id asc").Find(&list).Error
	return list, err
}

func (r *PortProxyRepository) GetByID(id uint) (*model.PortProxyRule, error) {
	var m model.PortProxyRule
	if err := r.db.Preload("Port").First(&m, id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *PortProxyRepository) GetByCode(code string) (*model.PortProxyRule, error) {
	var m model.PortProxyRule
	if err := r.db.Where("code = ?", code).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *PortProxyRepository) Create(m *model.PortProxyRule) error { return r.db.Create(m).Error }
func (r *PortProxyRepository) Update(m *model.PortProxyRule) error { return r.db.Save(m).Error }
func (r *PortProxyRepository) Delete(id uint) error {
	return r.db.Delete(&model.PortProxyRule{}, id).Error
}

func (r *PortProxyRepository) CountByPort(portID uint) (int64, error) {
	var n int64
	err := r.db.Model(&model.PortProxyRule{}).Where("port_id = ?", portID).Count(&n).Error
	return n, err
}

// ListEnabledRuntime 启用端口 + 启用 APP/反代/脚本,供编译运行时规则。
func (r *GatewayPortRepository) ListEnabledRuntime() ([]model.GatewayPort, error) {
	var list []model.GatewayPort
	err := r.db.Where("enabled = ?", true).
		Preload("Apps", "enabled = ?", true).
		Preload("Proxies", "enabled = ?", true).
		Preload("Scripts", "enabled = ?", true).
		Find(&list).Error
	return list, err
}

// PortScriptRepository 端口路由脚本。
type PortScriptRepository struct{ db *gorm.DB }

func NewPortScriptRepository(db *gorm.DB) *PortScriptRepository {
	return &PortScriptRepository{db: db}
}

func (r *PortScriptRepository) List() ([]model.PortRouteScript, error) {
	var list []model.PortRouteScript
	err := r.db.Preload("Port").Order("port_id asc, priority asc, id asc").Find(&list).Error
	return list, err
}

func (r *PortScriptRepository) ListByPort(portID uint) ([]model.PortRouteScript, error) {
	var list []model.PortRouteScript
	err := r.db.Where("port_id = ?", portID).Order("priority asc, id asc").Find(&list).Error
	return list, err
}

func (r *PortScriptRepository) GetByID(id uint) (*model.PortRouteScript, error) {
	var m model.PortRouteScript
	if err := r.db.Preload("Port").First(&m, id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *PortScriptRepository) GetByCode(code string) (*model.PortRouteScript, error) {
	var m model.PortRouteScript
	if err := r.db.Where("code = ?", code).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *PortScriptRepository) Create(m *model.PortRouteScript) error { return r.db.Create(m).Error }
func (r *PortScriptRepository) Update(m *model.PortRouteScript) error { return r.db.Save(m).Error }
func (r *PortScriptRepository) Delete(id uint) error {
	return r.db.Delete(&model.PortRouteScript{}, id).Error
}

func (r *PortScriptRepository) CountByPort(portID uint) (int64, error) {
	var n int64
	err := r.db.Model(&model.PortRouteScript{}).Where("port_id = ?", portID).Count(&n).Error
	return n, err
}
