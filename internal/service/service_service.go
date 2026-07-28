package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/pkg/artifact"
	"aluka_ops/internal/pkg/healthcheck"
	"aluka_ops/internal/pkg/logstream"
	"aluka_ops/internal/pkg/process"
	"aluka_ops/internal/repository"
)

// restartState 连续崩溃拉起计数(内存态,进程重启后清零)。
type restartState struct {
	count int
	last  time.Time
}

// ServiceService 服务业务逻辑:CRUD + 生命周期动作编排。
//
// 动作(start/stop/restart)统一模式:
//  1. 校验服务与状态
//  2. 创建 Operation(status=running)
//  3. 执行 process.Manager
//  4. 按结果更新 Service 状态与 Operation 结果(事务)
type ServiceService struct {
	db      *gorm.DB
	repo    *repository.ServiceRepository
	opRepo  *repository.OperationRepository
	artRepo *repository.ArtifactRepository
	store   *artifact.Store
	procs   *process.Manager
	hub     *logstream.LogHub
	health  *healthcheck.Monitor
	dataDir string // 用于拼接日志目录

	restartMu   sync.Mutex
	restarts    map[uint]*restartState // serviceID -> 连续自动拉起次数
	lifecycleMu sync.Mutex
	lifecycle   map[uint]*sync.Mutex
}

// SetLogHub 注入日志分发中心(避免循环依赖,setter 注入)。
func (s *ServiceService) SetLogHub(hub *logstream.LogHub) {
	s.hub = hub
}

// SetArtifactDeps 注入制品仓储与存储器(install/uninstall 用)。
func (s *ServiceService) SetArtifactDeps(artRepo *repository.ArtifactRepository, store *artifact.Store) {
	s.artRepo = artRepo
	s.store = store
}

// SetHealthMonitor 注入健康检查监视器。
func (s *ServiceService) SetHealthMonitor(m *healthcheck.Monitor) {
	s.health = m
}

// HealthProbeTargets 返回当前需要探测的服务配置(running + 启用探针)。
// 供 healthcheck.Monitor 的 ConfigProvider 使用。
func (s *ServiceService) HealthProbeTargets() map[uint]healthcheck.Config {
	services, err := s.repo.List(repository.ListFilter{Status: string(model.StatusRunning)})
	if err != nil {
		return nil
	}
	out := make(map[uint]healthcheck.Config)
	for _, svc := range services {
		if !s.procs.IsAlive(svc.PID) {
			continue
		}
		cfg, err := s.repo.GetCurrentConfig(svc.ID)
		if err != nil || cfg == nil {
			continue
		}
		hc := healthcheck.ParseConfig(cfg.HealthCheck)
		// target 为空时,用 port 推导
		if hc.Enabled() && strings.TrimSpace(hc.Target) == "" && cfg.Port > 0 {
			if hc.Type == healthcheck.TypeTCP {
				hc.Target = fmt.Sprintf("127.0.0.1:%d", cfg.Port)
			} else if hc.Type == healthcheck.TypeHTTP {
				hc.Target = fmt.Sprintf("http://127.0.0.1:%d/", cfg.Port)
			}
		}
		if hc.Enabled() {
			out[svc.ID] = hc
		}
	}
	return out
}

// NewServiceService 构造。
func NewServiceService(
	db *gorm.DB,
	repo *repository.ServiceRepository,
	opRepo *repository.OperationRepository,
	procs *process.Manager,
	dataDir string,
) *ServiceService {
	s := &ServiceService{
		db:        db,
		repo:      repo,
		opRepo:    opRepo,
		procs:     procs,
		dataDir:   dataDir,
		restarts:  make(map[uint]*restartState),
		lifecycle: make(map[uint]*sync.Mutex),
	}
	// 注册进程意外退出回调 → 崩溃检测 + 自动拉起
	procs.SetExitHandler(s.onProcessExit)
	return s
}

// ===== 创建/CRUD =====

// CreateServiceInput 创建服务入参。
type CreateServiceInput struct {
	Code        string            `json:"code"        binding:"required"`
	Name        string            `json:"name"        binding:"required"`
	Type        model.ServiceType `json:"type"`
	Description string            `json:"description"`
	RuntimeID   *uint             `json:"runtime_id"`
	WorkDir     string            `json:"work_dir"`
	// 初始配置
	Command         string `json:"command"`
	Args            string `json:"args"`
	JVMArgs         string `json:"jvm_args"`
	EnvVars         string `json:"env_vars"`
	Port            int    `json:"port"`
	AutoRestart     bool   `json:"auto_restart"`
	ShutdownTimeout int    `json:"shutdown_timeout"`
}

// Create 创建服务 + 初始 ServiceConfig(事务)。状态置为 created。
func (s *ServiceService) Create(in CreateServiceInput) (*model.Service, error) {
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	if code == "" || name == "" {
		return nil, ErrInvalidName
	}
	t := in.Type
	if t == "" {
		t = model.ServiceTypeJar
	}
	if t == model.ServiceTypeJar && in.RuntimeID == nil {
		return nil, ErrRuntimeRequired
	}
	if in.ShutdownTimeout <= 0 {
		in.ShutdownTimeout = 10
	}

	svc := &model.Service{
		Code:        code,
		Name:        name,
		Type:        t,
		Description: in.Description,
		Status:      model.StatusCreated,
		RuntimeID:   in.RuntimeID,
		WorkDir:     in.WorkDir,
		NodeID:      1, // 单机版恒为 local 节点
	}

	cfg := &model.ServiceConfig{
		IsCurrent:       true,
		Command:         in.Command,
		Args:            in.Args,
		JVMArgs:         in.JVMArgs,
		EnvVars:         in.EnvVars,
		Port:            in.Port,
		AutoRestart:     in.AutoRestart,
		ShutdownTimeout: in.ShutdownTimeout,
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(svc).Error; err != nil {
			return err
		}
		cfg.ServiceID = svc.ID
		return tx.Create(cfg).Error
	})
	if err != nil {
		return nil, err
	}
	return svc, nil
}

// List 列表。
func (s *ServiceService) List(f repository.ListFilter) ([]model.Service, error) {
	return s.repo.List(f)
}

// GetDetail 详情(含 runtime 信息)。
func (s *ServiceService) GetDetail(id uint) (map[string]any, error) {
	svc, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	cfg, _ := s.repo.GetCurrentConfig(id)

	result := map[string]any{
		"service": svc,
		"config":  cfg,
	}
	if svc.RuntimeID != nil {
		if rt, err := s.repo.GetRuntime(*svc.RuntimeID); err == nil {
			result["runtime"] = rt
		}
	}
	// 附加实时存活状态与健康检查
	alive := s.procs.IsAlive(svc.PID)
	result["alive"] = alive
	if st, err := s.GetStatus(id); err == nil {
		if h, ok := st["health"]; ok {
			result["health"] = h
		}
	}
	return result, nil
}

// UpdateInput 更新服务基础信息。
type UpdateServiceInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	RuntimeID   *uint   `json:"runtime_id"`
	WorkDir     *string `json:"work_dir"`
}

// Update 更新(运行中只允许改描述)。
func (s *ServiceService) Update(id uint, in UpdateServiceInput) (*model.Service, error) {
	svc, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	running := svc.Status == model.StatusRunning

	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, ErrInvalidName
		}
		svc.Name = name
	}
	if in.Description != nil {
		svc.Description = *in.Description
	}
	if !running {
		if in.RuntimeID != nil {
			svc.RuntimeID = in.RuntimeID
		}
		if in.WorkDir != nil {
			svc.WorkDir = *in.WorkDir
		}
	} else if (in.RuntimeID != nil) || (in.WorkDir != nil) {
		return nil, ErrCannotModify
	}

	if err := s.repo.Update(svc); err != nil {
		return nil, err
	}
	return svc, nil
}

// Delete 删除(仅非运行态)。
func (s *ServiceService) Delete(id uint) error {
	svc, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if svc.Status == model.StatusRunning {
		return ErrCannotDelete
	}
	return s.repo.Delete(id)
}

// UpdateConfigInput 更新运行配置入参(指针字段为 nil 表示不改)。
type UpdateConfigInput struct {
	Command         *string `json:"command"`
	Args            *string `json:"args"`
	JVMArgs         *string `json:"jvm_args"`
	EnvVars         *string `json:"env_vars"`
	Port            *int    `json:"port"`
	HealthCheck     *string `json:"health_check"` // JSON: {type,target,interval_sec,timeout_sec}
	AutoRestart     *bool   `json:"auto_restart"`
	MaxRestarts     *int    `json:"max_restarts"`
	ShutdownTimeout *int    `json:"shutdown_timeout"`
}

// UpdateConfig 更新当前生效配置。
// 运行中仅允许改 auto_restart / max_restarts / shutdown_timeout / health_check;
// 命令/参数/环境变量/端口需停服后修改。
func (s *ServiceService) UpdateConfig(id uint, in UpdateConfigInput) (*model.ServiceConfig, error) {
	svc, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	cfg, err := s.repo.GetCurrentConfig(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	running := svc.Status == model.StatusRunning
	// 运行中禁止改启动相关字段
	if running {
		if in.Command != nil || in.Args != nil || in.JVMArgs != nil || in.EnvVars != nil || in.Port != nil {
			return nil, ErrCannotModify
		}
	}

	if in.Command != nil {
		cfg.Command = *in.Command
	}
	if in.Args != nil {
		cfg.Args = *in.Args
	}
	if in.JVMArgs != nil {
		cfg.JVMArgs = *in.JVMArgs
	}
	if in.EnvVars != nil {
		// 允许空字符串清空;若非空则校验 JSON
		v := strings.TrimSpace(*in.EnvVars)
		if v != "" {
			var tmp map[string]string
			if err := json.Unmarshal([]byte(v), &tmp); err != nil {
				return nil, fmt.Errorf("%w: env_vars 须为 JSON 对象", ErrInvalidConfig)
			}
		}
		cfg.EnvVars = v
	}
	if in.Port != nil {
		cfg.Port = *in.Port
	}
	if in.HealthCheck != nil {
		v := strings.TrimSpace(*in.HealthCheck)
		if v != "" {
			// 校验 JSON 结构
			hc := healthcheck.ParseConfig(v)
			if hc.Type != healthcheck.TypeNone && hc.Type != healthcheck.TypeHTTP && hc.Type != healthcheck.TypeTCP {
				return nil, fmt.Errorf("%w: health_check.type 须为 none/http/tcp", ErrInvalidConfig)
			}
			// 重新序列化规范化
			b, _ := json.Marshal(hc)
			v = string(b)
		}
		cfg.HealthCheck = v
		// 配置变更后清缓存,下次立即按新配置探测
		if s.health != nil {
			s.health.Clear(id)
		}
	}
	if in.AutoRestart != nil {
		cfg.AutoRestart = *in.AutoRestart
	}
	if in.MaxRestarts != nil {
		if *in.MaxRestarts < 0 {
			return nil, fmt.Errorf("%w: max_restarts 不能为负", ErrInvalidConfig)
		}
		cfg.MaxRestarts = *in.MaxRestarts
	}
	if in.ShutdownTimeout != nil {
		if *in.ShutdownTimeout <= 0 {
			return nil, fmt.Errorf("%w: shutdown_timeout 须为正整数", ErrInvalidConfig)
		}
		cfg.ShutdownTimeout = *in.ShutdownTimeout
	}

	if err := s.repo.UpdateConfig(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (s *ServiceService) serviceLock(id uint) *sync.Mutex {
	s.lifecycleMu.Lock()
	defer s.lifecycleMu.Unlock()
	if mu := s.lifecycle[id]; mu != nil {
		return mu
	}
	mu := &sync.Mutex{}
	s.lifecycle[id] = mu
	return mu
}

func (s *ServiceService) withLifecycle(id uint, fn func() (*model.Operation, error)) (*model.Operation, error) {
	mu := s.serviceLock(id)
	mu.Lock()
	defer mu.Unlock()
	return fn()
}

// Start 启动服务。
func (s *ServiceService) Start(id uint) (*model.Operation, error) {
	return s.withLifecycle(id, func() (*model.Operation, error) {
		return s.startInternal(id, false)
	})
}

// startInternal 启动实现。auto=true 表示崩溃自动拉起(不重置连续计数)。
func (s *ServiceService) startInternal(id uint, auto bool) (*model.Operation, error) {
	svc, cfg, err := s.loadForAction(id)
	if err != nil {
		return nil, err
	}

	// 已运行:幂等返回(不报错)
	if svc.Status == model.StatusRunning && s.procs.IsAlive(svc.PID) {
		return nil, ErrAlreadyRunning
	}

	detail := ""
	if auto {
		detail = "auto_restart"
	}
	op := s.beginOp(svc.ID, model.OpStart, detail)

	// 拼装启动命令
	opts, err := s.buildStartOptions(svc, cfg)
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}

	info, err := s.procs.Start(*opts)
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}

	// 更新服务状态
	now := time.Now()
	if err := s.repo.UpdateStatus(svc.ID, model.StatusRunning, info.PID, asAny(&now)); err != nil {
		_ = s.procs.Stop(svc.ID, info.PID, cfg.ShutdownTimeout)
		s.finishOpFail(op, err)
		return op, err
	}
	if !auto {
		// 用户手动启动:重置连续崩溃计数
		s.resetRestartCount(svc.ID)
	}
	s.finishOpOK(op, fmt.Sprintf("PID=%d, 日志=%s", info.PID, info.LogPath))
	// 通知日志中心切换到新日志文件,使订阅者能继续收到新输出
	s.NotifyLogPath(svc.ID)
	return op, nil
}

// Stop 停止服务。
func (s *ServiceService) Stop(id uint) (*model.Operation, error) {
	return s.withLifecycle(id, func() (*model.Operation, error) {
		return s.stopInternal(id)
	})
}

func (s *ServiceService) stopInternal(id uint) (*model.Operation, error) {
	svc, _, err := s.loadForAction(id)
	if err != nil {
		return nil, err
	}
	if svc.Status != model.StatusRunning {
		return nil, ErrNotRunning
	}

	op := s.beginOp(svc.ID, model.OpStop, "")

	cfg, _ := s.repo.GetCurrentConfig(svc.ID)
	timeout := 10
	if cfg != nil && cfg.ShutdownTimeout > 0 {
		timeout = cfg.ShutdownTimeout
	}

	if err := s.repo.UpdateStatus(svc.ID, model.StatusStopping, svc.PID, nil); err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	if err := s.procs.Stop(svc.ID, svc.PID, timeout); err != nil {
		s.finishOpFail(op, err)
		return op, err
	}

	if err := s.repo.UpdateStatus(svc.ID, model.StatusStopped, 0, asAny((*time.Time)(nil))); err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	s.resetRestartCount(svc.ID)
	if s.health != nil {
		s.health.Clear(svc.ID)
	}
	s.finishOpOK(op, "已停止")
	return op, nil
}

// Restart 重启:先 stop 再 start。
func (s *ServiceService) Restart(id uint) (*model.Operation, error) {
	return s.withLifecycle(id, func() (*model.Operation, error) {
		return s.restartInternal(id)
	})
}

func (s *ServiceService) restartInternal(id uint) (*model.Operation, error) {
	svc, _, err := s.loadForAction(id)
	if err != nil {
		return nil, err
	}

	op := s.beginOp(svc.ID, model.OpRestart, "")

	// 若正在运行,先停止
	if svc.Status == model.StatusRunning {
		cfg, _ := s.repo.GetCurrentConfig(svc.ID)
		timeout := 10
		if cfg != nil && cfg.ShutdownTimeout > 0 {
			timeout = cfg.ShutdownTimeout
		}
		if err := s.repo.UpdateStatus(svc.ID, model.StatusStopping, svc.PID, nil); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
		if err := s.procs.Stop(svc.ID, svc.PID, timeout); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
	}

	// 重新加载最新状态后启动
	svc2, cfg, err := s.loadForAction(id)
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	opts, err := s.buildStartOptions(svc2, cfg)
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	info, err := s.procs.Start(*opts)
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	now := time.Now()
	if err := s.repo.UpdateStatus(svc2.ID, model.StatusRunning, info.PID, asAny(&now)); err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	s.resetRestartCount(svc2.ID)
	s.finishOpOK(op, fmt.Sprintf("已重启, PID=%d", info.PID))
	// 重启产生新日志文件,通知日志中心切换
	s.NotifyLogPath(svc2.ID)
	return op, nil
}

// ===== 安装 / 卸载(M4)=====

// Install 部署指定制品到 install_dir,并标记当前版本(首次安装)。
// 语义:首次安装或重新安装同一版本。升级/回滚用 Upgrade/Rollback。
func (s *ServiceService) Install(serviceID, artifactID uint) (*model.Operation, error) {
	return s.withLifecycle(serviceID, func() (*model.Operation, error) {
		return s.deployWithOpType(serviceID, artifactID, model.OpInstall)
	})
}

// Upgrade 升级到指定制品(部署新版本)。
// 部署失败时由 Deploy 原子替换保证当前版本不变(自动回滚)。
func (s *ServiceService) Upgrade(serviceID, artifactID uint) (*model.Operation, error) {
	return s.withLifecycle(serviceID, func() (*model.Operation, error) {
		return s.deployWithOpType(serviceID, artifactID, model.OpUpgrade)
	})
}

// Rollback 回滚到指定历史制品(重新部署旧版本)。
// 校验:目标制品不能是当前版本(回滚到当前无意义)。
// 部署失败时同样由原子替换保证当前版本不变。
func (s *ServiceService) Rollback(serviceID, artifactID uint) (*model.Operation, error) {
	// 校验目标不是当前版本
	art, err := s.artRepo.GetByID(artifactID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if art.IsCurrent {
		return nil, ErrAlreadyCurrent
	}
	return s.withLifecycle(serviceID, func() (*model.Operation, error) {
		return s.deployWithOpType(serviceID, artifactID, model.OpUpgrade)
	})
}

// deployWithOpType 部署指定制品的统一实现,Install/Upgrade/Rollback 共用。
//
// 流程:
//  1. 校验服务存在、制品归属正确
//  2. 若服务运行中,先停止
//  3. 校验制品 SHA256(防损坏)
//  4. 部署(单文件复制 / zip 解压),原子替换 install_dir
//     —— 部署失败时 install_dir 仍是旧版本(自动回滚),DB 不更新
//  5. 标记 artifact.is_current,更新 service.current_version
//  6. (可选)探测到入口文件时,更新当前配置的 command
//
// opType 区分 install / upgrade(用于 Operation 记录与前端展示)。
func (s *ServiceService) deployWithOpType(serviceID, artifactID uint, opType model.OpType) (*model.Operation, error) {
	svc, err := s.repo.GetByID(serviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	art, err := s.artRepo.GetByID(artifactID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if art.ServiceID != serviceID {
		return nil, ErrNotFound
	}

	op := s.beginOp(serviceID, opType, fmt.Sprintf("version=%s file=%s", art.Version, art.Filename))

	// 1) 若运行中,先停止
	if svc.Status == model.StatusRunning {
		cfg, _ := s.repo.GetCurrentConfig(serviceID)
		timeout := 10
		if cfg != nil && cfg.ShutdownTimeout > 0 {
			timeout = cfg.ShutdownTimeout
		}
		if err := s.repo.UpdateStatus(serviceID, model.StatusStopping, svc.PID, nil); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
		if err := s.procs.Stop(serviceID, svc.PID, timeout); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
		_ = s.repo.UpdateStatus(serviceID, model.StatusStopped, 0, nil)
	}

	// 2) 校验制品完整性
	if art.Checksum != "" {
		ok, err := s.store.VerifyChecksum(art.StoragePath, art.Checksum)
		if err != nil {
			s.finishOpFail(op, fmt.Errorf("校验制品失败: %w", err))
			return op, err
		}
		if !ok {
			s.finishOpFail(op, fmt.Errorf("制品校验和不匹配,文件可能损坏"))
			return op, fmt.Errorf("制品校验和不匹配,文件可能损坏")
		}
	}

	// 3) 部署到 install_dir(原子替换:失败时旧版本不动,即自动回滚)
	installDir := svc.InstallDir
	if installDir == "" {
		installDir = artifact.DefaultInstallDir(s.dataDir, svc.Code)
	}
	installDir, err = artifact.ValidateInstallDir(s.dataDir, installDir)
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	kind := artifact.DetectKind(art.Filename)
	storagePath, err := s.store.ResolveFile(art.StoragePath)
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	result, err := artifact.Deploy(storagePath, kind, installDir)
	if err != nil {
		// 部署失败:install_dir 仍是旧版本,DB 未改动 → 自动回滚已生效
		s.finishOpFail(op, fmt.Errorf("部署失败,已自动回滚到当前版本: %w", err))
		return op, err
	}

	// 4) 更新数据库:标记当前版本 + 更新 install_dir + current_version
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// 清除其他制品的 is_current
		if err := tx.Model(&model.Artifact{}).
			Where("service_id = ?", serviceID).
			Update("is_current", false).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.Artifact{}).
			Where("id = ?", artifactID).
			Update("is_current", true).Error; err != nil {
			return err
		}
		// 更新服务
		return tx.Model(&model.Service{}).Where("id = ?", serviceID).Updates(map[string]any{
			"install_dir":     result.InstallDir,
			"current_version": art.Version,
			"status":          model.StatusStopped,
		}).Error
	})
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}

	// 5) 探测到入口文件时,更新当前配置的 command(便于直接启动)
	if result.EntryFile != "" {
		if cfg, _ := s.repo.GetCurrentConfig(serviceID); cfg != nil {
			// 仅在 command 为空时更新,避免覆盖用户自定义命令
			if cfg.Command == "" {
				_ = s.db.Model(&model.ServiceConfig{}).Where("id = ?", cfg.ID).
					Update("command", result.EntryFile).Error
			}
		}
	}

	s.finishOpOK(op, fmt.Sprintf("已部署 %s → %s", art.Version, result.InstallDir))
	return op, nil
}

// Uninstall 卸载服务:停止 → 清理 install_dir → 重置版本。
//
// keepData=true 时保留 install_dir 内容(仅重置版本标记)。
func (s *ServiceService) Uninstall(serviceID uint, keepData bool) (*model.Operation, error) {
	return s.withLifecycle(serviceID, func() (*model.Operation, error) {
		return s.uninstallInternal(serviceID, keepData)
	})
}

func (s *ServiceService) uninstallInternal(serviceID uint, keepData bool) (*model.Operation, error) {
	svc, err := s.repo.GetByID(serviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	op := s.beginOp(serviceID, model.OpUninstall, fmt.Sprintf("keepData=%v", keepData))

	// 1) 若运行中,先停止
	if svc.Status == model.StatusRunning {
		cfg, _ := s.repo.GetCurrentConfig(serviceID)
		timeout := 10
		if cfg != nil && cfg.ShutdownTimeout > 0 {
			timeout = cfg.ShutdownTimeout
		}
		if err := s.repo.UpdateStatus(serviceID, model.StatusStopping, svc.PID, nil); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
		if err := s.procs.Stop(serviceID, svc.PID, timeout); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
	}

	// 2) 清理 install_dir(可选)
	if !keepData && svc.InstallDir != "" {
		installDir, err := artifact.ValidateInstallDir(s.dataDir, svc.InstallDir)
		if err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
		if err := artifact.CleanDir(installDir, false); err != nil {
			s.finishOpFail(op, fmt.Errorf("清理目录失败: %w", err))
			return op, err
		}
	}

	// 3) 重置数据库状态
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// 清除所有制品的 is_current
		if err := tx.Model(&model.Artifact{}).
			Where("service_id = ?", serviceID).
			Update("is_current", false).Error; err != nil {
			return err
		}
		updates := map[string]any{
			"status":          model.StatusStopped,
			"pid":             0,
			"current_version": "",
		}
		if !keepData {
			updates["install_dir"] = ""
		}
		return tx.Model(&model.Service{}).Where("id = ?", serviceID).Updates(updates).Error
	})
	if err != nil {
		s.finishOpFail(op, err)
		return op, err
	}

	s.finishOpOK(op, "已卸载")
	return op, nil
}

// onProcessExit 进程意外退出回调:标记 crashed,按配置尝试自动拉起。
func (s *ServiceService) onProcessExit(serviceID uint, pid int, waitErr error) {
	svc, err := s.repo.GetByID(serviceID)
	if err != nil {
		return
	}
	// 仅当 DB 仍认为该 PID 处于运行状态时处理,避免旧进程事件覆盖新进程。
	if svc.Status != model.StatusRunning || (svc.PID != 0 && svc.PID != pid) {
		return
	}
	if _, ok := s.procs.Get(serviceID); ok {
		return
	}

	_ = s.repo.UpdateStatus(serviceID, model.StatusCrashed, pid, nil)
	log.Printf("[auto-restart] 服务 #%d 进程退出(pid=%d, err=%v), 状态 → crashed", serviceID, pid, waitErr)

	cfg, _ := s.repo.GetCurrentConfig(serviceID)
	if cfg == nil || !cfg.AutoRestart {
		return
	}
	max := cfg.MaxRestarts
	if max <= 0 {
		max = 3
	}

	count := s.bumpRestartCount(serviceID)
	if count > max {
		log.Printf("[auto-restart] 服务 #%d 已达最大拉起次数 %d, 放弃", serviceID, max)
		return
	}

	// 指数退避:1s, 2s, 4s... 上限 30s
	backoff := time.Duration(1<<uint(count-1)) * time.Second
	if backoff > 30*time.Second {
		backoff = 30 * time.Second
	}
	log.Printf("[auto-restart] 服务 #%d 第 %d/%d 次自动拉起, %v 后执行", serviceID, count, max, backoff)
	time.Sleep(backoff)

	// 再次确认并在同一把服务锁内启动,避免手动动作与自动拉起交错。
	_, err = s.withLifecycle(serviceID, func() (*model.Operation, error) {
		svc2, err := s.repo.GetByID(serviceID)
		if err != nil || svc2.Status == model.StatusRunning || svc2.Status == model.StatusStopping {
			return nil, err
		}
		return s.startInternal(serviceID, true)
	})
	if err != nil {
		log.Printf("[auto-restart] 服务 #%d 自动拉起失败: %v", serviceID, err)
	} else {
		log.Printf("[auto-restart] 服务 #%d 自动拉起成功", serviceID)
	}
}

func (s *ServiceService) bumpRestartCount(id uint) int {
	s.restartMu.Lock()
	defer s.restartMu.Unlock()
	st, ok := s.restarts[id]
	if !ok {
		st = &restartState{}
		s.restarts[id] = st
	}
	// 若距上次拉起超过 5 分钟,重置计数(认为服务曾稳定运行)
	if time.Since(st.last) > 5*time.Minute {
		st.count = 0
	}
	st.count++
	st.last = time.Now()
	return st.count
}

func (s *ServiceService) resetRestartCount(id uint) {
	s.restartMu.Lock()
	delete(s.restarts, id)
	s.restartMu.Unlock()
}

// ConsoleInput 向运行中服务的 stdin 写入控制台输入。
// 用于 xterm 控制台交互;仅当进程由本实例 ProcessManager 拉起时可用。
func (s *ServiceService) ConsoleInput(id uint, data string) error {
	svc, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if svc.Status != model.StatusRunning {
		return ErrNotRunning
	}
	// 保证以换行结尾,便于交互式程序按行读取
	payload := data
	if payload != "" && !strings.HasSuffix(payload, "\n") {
		payload += "\n"
	}
	if err := s.procs.WriteStdin(id, []byte(payload)); err != nil {
		if errors.Is(err, process.ErrNoStdin) {
			return ErrNoConsole
		}
		return err
	}
	return nil
}

// GetStatus 实时状态:探测 PID 存活 + 健康检查,返回综合状态。
// 若 DB 标 running 但进程已死 → 视为 crashed,并同步更新 DB。
func (s *ServiceService) GetStatus(id uint) (map[string]any, error) {
	svc, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	alive := s.procs.IsAlive(svc.PID)
	status := string(svc.Status)

	// DB 认为在运行但实际已死 → 标记 crashed
	if svc.Status == model.StatusRunning && !alive {
		_ = s.repo.UpdateStatus(svc.ID, model.StatusCrashed, svc.PID, nil)
		status = string(model.StatusCrashed)
		if s.health != nil {
			s.health.Clear(svc.ID)
		}
	}

	result := map[string]any{
		"service_id": svc.ID,
		"status":     status,
		"pid":        svc.PID,
		"alive":      alive,
		"started_at": svc.StartedAt,
	}

	// 健康检查(仅 running 且进程存活时)
	var healthInfo map[string]any
	if status == string(model.StatusRunning) && alive {
		cfg, _ := s.repo.GetCurrentConfig(id)
		hc := healthcheck.Config{Type: healthcheck.TypeNone}
		if cfg != nil {
			hc = healthcheck.ParseConfig(cfg.HealthCheck)
			if hc.Enabled() && strings.TrimSpace(hc.Target) == "" && cfg.Port > 0 {
				if hc.Type == healthcheck.TypeTCP {
					hc.Target = fmt.Sprintf("127.0.0.1:%d", cfg.Port)
				} else {
					hc.Target = fmt.Sprintf("http://127.0.0.1:%d/", cfg.Port)
				}
			}
		}
		if hc.Enabled() {
			var r healthcheck.Result
			if s.health != nil {
				// 优先用缓存;无缓存则立即探测
				if cached, ok := s.health.Get(id); ok && cached.Checked {
					r = cached
				} else {
					r = s.health.CheckNow(id, hc)
				}
			} else {
				r = healthcheck.Probe(hc)
			}
			healthInfo = map[string]any{
				"enabled":    true,
				"healthy":    r.Healthy,
				"checked":    r.Checked,
				"message":    r.Message,
				"latency_ms": r.LatencyMs,
				"checked_at": r.CheckedAt,
				"type":       r.Type,
				"target":     r.Target,
			}
		} else {
			healthInfo = map[string]any{"enabled": false, "healthy": true, "message": "未配置"}
		}
	} else {
		healthInfo = map[string]any{"enabled": false, "healthy": false, "message": "服务未运行"}
	}
	result["health"] = healthInfo
	return result, nil
}

// ===== 内部辅助 =====

// loadForAction 加载服务与当前配置,供动作执行使用。
func (s *ServiceService) loadForAction(id uint) (*model.Service, *model.ServiceConfig, error) {
	svc, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, err
	}
	cfg, err := s.repo.GetCurrentConfig(id)
	if err != nil {
		return svc, &model.ServiceConfig{}, nil // 配置缺失不阻断(用默认)
	}
	return svc, cfg, nil
}

// buildStartOptions 按 service.type 拼装启动参数。
func (s *ServiceService) buildStartOptions(svc *model.Service, cfg *model.ServiceConfig) (*process.StartOptions, error) {
	if cfg == nil {
		cfg = &model.ServiceConfig{}
	}

	logPath := filepath.Join(s.dataDir, "logs", svc.Code, fmt.Sprintf("%s.log", time.Now().Format("20060102_150405")))

	var name string
	var args []string

	switch svc.Type {
	case model.ServiceTypeJar:
		// 正确顺序: java [jvmArgs] -jar <jar路径> [appArgs]
		if svc.RuntimeID == nil {
			return nil, fmt.Errorf("jar 服务未绑定运行环境: %w", ErrRuntimeRequired)
		}
		rt, err := s.repo.GetRuntime(*svc.RuntimeID)
		if err != nil || rt.InstallPath == "" {
			return nil, fmt.Errorf("jar 服务未配置有效的运行环境: %w", ErrRuntimeRequired)
		}
		javaExe := filepath.Join(rt.InstallPath, "bin", "java.exe")
		if !fileExists(javaExe) {
			javaExe = filepath.Join(rt.InstallPath, "bin", "java")
		}
		name = javaExe
		jarPath := strings.TrimSpace(cfg.Command)
		if jarPath == "" {
			return nil, fmt.Errorf("jar 服务未配置启动命令(jar 路径)")
		}
		// 相对路径时优先相对 install_dir,其次 work_dir
		if !filepath.IsAbs(jarPath) {
			base := svc.InstallDir
			if base == "" {
				base = svc.WorkDir
			}
			if base != "" {
				jarPath = filepath.Join(base, jarPath)
			}
		}
		args = append(splitArgs(cfg.JVMArgs), "-jar", jarPath)
		args = append(args, splitArgs(cfg.Args)...)
		// 注入 runtime 环境变量
		cfg.EnvVars = mergeRuntimeEnv(cfg.EnvVars, rt)

	case model.ServiceTypeExe:
		name = cfg.Command
		args = splitArgs(cfg.Args)

	case model.ServiceTypeBat:
		// /c 后整段作为一条命令;工作目录须指向脚本所在目录(如 D:\services\outside-prescription)
		name = "cmd.exe"
		line := strings.TrimSpace(cfg.Command)
		if strings.TrimSpace(cfg.Args) != "" {
			line = line + " " + strings.TrimSpace(cfg.Args)
		}
		args = []string{"/c", line}

	case model.ServiceTypeSh:
		name = "bash"
		line := strings.TrimSpace(cfg.Command)
		if strings.TrimSpace(cfg.Args) != "" {
			line = line + " " + strings.TrimSpace(cfg.Args)
		}
		args = []string{"-c", line}

	case model.ServiceTypePs1:
		name = "powershell.exe"
		args = []string{"-ExecutionPolicy", "Bypass", "-File", strings.TrimSpace(cfg.Command)}
		args = append(args, splitArgs(cfg.Args)...)

	default:
		return nil, fmt.Errorf("不支持的服务类型: %s", svc.Type)
	}

	timeout := cfg.ShutdownTimeout
	if timeout <= 0 {
		timeout = 10
	}

	// 工作目录:优先 work_dir,空则回退 install_dir(方便相对路径与外部配置文件)
	workDir := strings.TrimSpace(svc.WorkDir)
	if workDir == "" {
		workDir = strings.TrimSpace(svc.InstallDir)
	}

	return &process.StartOptions{
		ServiceID:       svc.ID,
		LogFile:         logPath,
		Name:            name,
		Args:            args,
		Dir:             workDir,
		Env:             buildEnv(cfg.EnvVars),
		ShutdownTimeout: timeout,
	}, nil
}

// beginOp 开始一条操作记录。
func (s *ServiceService) beginOp(serviceID uint, t model.OpType, detail string) *model.Operation {
	op := &model.Operation{
		ServiceID:   serviceID,
		Type:        t,
		Status:      model.OpRunning,
		TriggeredBy: "system",
		Detail:      detail,
	}
	now := time.Now()
	op.StartedAt = &now
	_ = s.opRepo.Create(op)
	return op
}

// finishOpOK 标记成功。
func (s *ServiceService) finishOpOK(op *model.Operation, msg string) {
	now := time.Now()
	op.Status = model.OpSuccess
	op.OutputLog = msg
	op.FinishedAt = &now
	_ = s.opRepo.Update(op)
}

// finishOpFail 标记失败。
func (s *ServiceService) finishOpFail(op *model.Operation, e error) {
	now := time.Now()
	op.Status = model.OpFailed
	op.ErrorMsg = e.Error()
	op.FinishedAt = &now
	_ = s.opRepo.Update(op)
}

// ===== 操作记录查询 =====

// ListOperations 全局操作历史。
func (s *ServiceService) ListOperations(opType, status string, limit int) ([]model.Operation, error) {
	return s.opRepo.ListAll(opType, status, limit)
}

// ListOperationsEnriched 全局操作历史,附带服务名称(供操作中心展示)。
func (s *ServiceService) ListOperationsEnriched(opType, status string, limit int) ([]map[string]any, error) {
	ops, err := s.opRepo.ListAll(opType, status, limit)
	if err != nil {
		return nil, err
	}
	services, err := s.repo.List(repository.ListFilter{})
	if err != nil {
		return nil, err
	}
	nameByID := map[uint]string{}
	codeByID := map[uint]string{}
	for _, svc := range services {
		nameByID[svc.ID] = svc.Name
		codeByID[svc.ID] = svc.Code
	}
	out := make([]map[string]any, 0, len(ops))
	for _, op := range ops {
		out = append(out, map[string]any{
			"id":           op.ID,
			"service_id":   op.ServiceID,
			"service_name": nameByID[op.ServiceID],
			"service_code": codeByID[op.ServiceID],
			"type":         op.Type,
			"status":       op.Status,
			"triggered_by": op.TriggeredBy,
			"detail":       op.Detail,
			"output_log":   op.OutputLog,
			"error_msg":    op.ErrorMsg,
			"started_at":   op.StartedAt,
			"finished_at":  op.FinishedAt,
			"created_at":   op.CreatedAt,
			"updated_at":   op.UpdatedAt,
		})
	}
	return out, nil
}

// GetOperation 单条操作详情。
func (s *ServiceService) GetOperation(id uint) (*model.Operation, error) {
	op, err := s.opRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return op, nil
}

// ListServiceOperations 某服务的操作历史。
func (s *ServiceService) ListServiceOperations(serviceID uint, limit int) ([]model.Operation, error) {
	return s.opRepo.ListByService(serviceID, limit)
}

// GetLatestLogPath 返回某服务的最新日志文件绝对路径。
// 服务每次启动生成新日志(时间戳命名),这里按修改时间取最新。
// 不存在返回空字符串。
func (s *ServiceService) GetLatestLogPath(serviceID uint) (string, string, error) {
	svc, err := s.repo.GetByID(serviceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", "", ErrNotFound
		}
		return "", "", err
	}
	code := svc.Code
	dir := filepath.Join(s.dataDir, "logs", code)
	latest := latestLogFile(dir)
	return latest, code, nil
}

// NotifyLogPath 通知 LogHub 当前服务的日志文件路径(启动/重启后调用)。
// 供业务层在 Start/Restart 成功后触发,使正在订阅的客户端能切换到新文件。
func (s *ServiceService) NotifyLogPath(serviceID uint) {
	if s.hub == nil {
		return
	}
	latest, code, err := s.GetLatestLogPath(serviceID)
	if err != nil {
		return
	}
	s.hub.UpdateLogPath(serviceID, code, latest)
}

// ===== 环境变量工具 =====

// buildEnv 在父进程环境基础上叠加 JSON 环境变量。
// 注意:此处 cfg.EnvVars 可能已被 mergeRuntimeEnv 改写。
// 必须继承 PATH 等系统变量,否则 bat/sh 里直接调 java 会失败。
func buildEnv(envVarsJSON string) []string {
	envVarsJSON = strings.TrimSpace(envVarsJSON)
	if envVarsJSON == "" {
		return nil // nil → exec 完全继承父环境
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(envVarsJSON), &m); err != nil || len(m) == 0 {
		return nil
	}
	// 以父环境为底,同名 key 覆盖(Windows 环境变量名不区分大小写,简单覆盖即可)
	base := os.Environ()
	out := make([]string, 0, len(base)+len(m))
	// 先记下要覆盖的 key(小写),过滤父环境中的同名项
	override := map[string]string{}
	for k, v := range m {
		override[strings.ToLower(k)] = k + "=" + v
	}
	for _, e := range base {
		eq := strings.IndexByte(e, '=')
		if eq <= 0 {
			out = append(out, e)
			continue
		}
		key := strings.ToLower(e[:eq])
		if _, ok := override[key]; ok {
			continue // 跳过,后面追加覆盖值
		}
		out = append(out, e)
	}
	for _, kv := range override {
		out = append(out, kv)
	}
	return out
}

// mergeRuntimeEnv 将 runtime.EnvTemplate 渲染后并入 envVars(JSON)。
// 占位符:{{install_path}}、{{PATH}}。
func mergeRuntimeEnv(envVarsJSON string, rt *model.Runtime) string {
	if rt == nil || strings.TrimSpace(rt.EnvTemplate) == "" {
		return envVarsJSON
	}
	// 解析 envVars
	m := map[string]string{}
	if envVarsJSON != "" {
		_ = json.Unmarshal([]byte(envVarsJSON), &m)
	}
	// 解析 template
	tmpl := map[string]string{}
	if err := json.Unmarshal([]byte(rt.EnvTemplate), &tmpl); err != nil {
		return envVarsJSON
	}
	for k, v := range tmpl {
		v = strings.ReplaceAll(v, "{{install_path}}", rt.InstallPath)
		m[k] = v
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// splitArgs 按空白切分命令行参数,支持双引号/单引号包裹(引号本身不进入参数)。
// 例: -h "0.0.0.0" -p 6380  →  ["-h", "0.0.0.0", "-p", "6380"]
// 反斜杠仅用于转义引号自身: \"  → "
func splitArgs(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	var (
		out    []string
		cur    strings.Builder
		quote  rune // 0=无引号, '"' 或 '\''
		escape bool
	)
	flush := func() {
		if cur.Len() == 0 {
			return
		}
		out = append(out, cur.String())
		cur.Reset()
	}
	for _, r := range s {
		if escape {
			cur.WriteRune(r)
			escape = false
			continue
		}
		if r == '\\' && quote != '\'' {
			// 双引号或无引号时 \ 作为转义
			escape = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
				continue
			}
			cur.WriteRune(r)
			continue
		}
		switch r {
		case '"', '\'':
			quote = r
		case ' ', '\t', '\n', '\r':
			flush()
		default:
			cur.WriteRune(r)
		}
	}
	if escape {
		cur.WriteByte('\\')
	}
	flush()
	return out
}

// fileExists 判断文件存在。
func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// asAny 把任意值转为 *any(供 UpdateStatus 的 startedAt 参数)。
func asAny(v any) *any { return &v }

// latestLogFile 扫描目录,返回修改时间最新的 .log 文件绝对路径。
// 目录不存在或无日志文件返回空字符串。
func latestLogFile(dir string) string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	var newest string
	var newestTime time.Time
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if filepath.Ext(name) != ".log" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if newest == "" || info.ModTime().After(newestTime) {
			newest = filepath.Join(dir, name)
			newestTime = info.ModTime()
		}
	}
	return newest
}
