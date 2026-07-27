package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/pkg/artifact"
	"aluka_ops/internal/pkg/logstream"
	"aluka_ops/internal/pkg/process"
	"aluka_ops/internal/repository"
)

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
	dataDir string // 用于拼接日志目录
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

// NewServiceService 构造。
func NewServiceService(
	db *gorm.DB,
	repo *repository.ServiceRepository,
	opRepo *repository.OperationRepository,
	procs *process.Manager,
	dataDir string,
) *ServiceService {
	return &ServiceService{db: db, repo: repo, opRepo: opRepo, procs: procs, dataDir: dataDir}
}

// ===== 创建/CRUD =====

// CreateServiceInput 创建服务入参。
type CreateServiceInput struct {
	Code        string             `json:"code"        binding:"required"`
	Name        string             `json:"name"        binding:"required"`
	Type        model.ServiceType  `json:"type"`
	Description string             `json:"description"`
	RuntimeID   *uint              `json:"runtime_id"`
	WorkDir     string             `json:"work_dir"`
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
	// 附加实时存活状态
	result["alive"] = s.procs.IsAlive(svc.PID)
	return result, nil
}

// UpdateInput 更新服务基础信息。
type UpdateServiceInput struct {
	Name        *string            `json:"name"`
	Description *string            `json:"description"`
	RuntimeID   *uint              `json:"runtime_id"`
	WorkDir     *string            `json:"work_dir"`
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

// ===== 生命周期动作 =====

// Start 启动服务。
func (s *ServiceService) Start(id uint) (*model.Operation, error) {
	svc, cfg, err := s.loadForAction(id)
	if err != nil {
		return nil, err
	}

	// 已运行:幂等返回(不报错)
	if svc.Status == model.StatusRunning && s.procs.IsAlive(svc.PID) {
		return nil, ErrAlreadyRunning
	}

	op := s.beginOp(svc.ID, model.OpStart, "")

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
		s.finishOpFail(op, err)
		return op, err
	}
	s.finishOpOK(op, fmt.Sprintf("PID=%d, 日志=%s", info.PID, info.LogPath))
	// 通知日志中心切换到新日志文件,使订阅者能继续收到新输出
	s.NotifyLogPath(svc.ID)
	return op, nil
}

// Stop 停止服务。
func (s *ServiceService) Stop(id uint) (*model.Operation, error) {
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

	if err := s.procs.Stop(svc.ID, svc.PID, timeout); err != nil {
		s.finishOpFail(op, err)
		return op, err
	}

	if err := s.repo.UpdateStatus(svc.ID, model.StatusStopped, 0, asAny((*time.Time)(nil))); err != nil {
		s.finishOpFail(op, err)
		return op, err
	}
	s.finishOpOK(op, "已停止")
	return op, nil
}

// Restart 重启:先 stop 再 start。
func (s *ServiceService) Restart(id uint) (*model.Operation, error) {
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
	s.finishOpOK(op, fmt.Sprintf("已重启, PID=%d", info.PID))
	// 重启产生新日志文件,通知日志中心切换
	s.NotifyLogPath(svc2.ID)
	return op, nil
}

// ===== 安装 / 卸载(M4)=====

// Install 部署指定制品到 install_dir,并标记当前版本(首次安装)。
// 语义:首次安装或重新安装同一版本。升级/回滚用 Upgrade/Rollback。
func (s *ServiceService) Install(serviceID, artifactID uint) (*model.Operation, error) {
	return s.deployWithOpType(serviceID, artifactID, model.OpInstall)
}

// Upgrade 升级到指定制品(部署新版本)。
// 部署失败时由 Deploy 原子替换保证当前版本不变(自动回滚)。
func (s *ServiceService) Upgrade(serviceID, artifactID uint) (*model.Operation, error) {
	return s.deployWithOpType(serviceID, artifactID, model.OpUpgrade)
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
	return s.deployWithOpType(serviceID, artifactID, model.OpUpgrade)
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
		if err := s.procs.Stop(serviceID, svc.PID, timeout); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
		_ = s.repo.UpdateStatus(serviceID, model.StatusStopped, 0, nil)
	}

	// 2) 校验制品完整性
	if art.Checksum != "" {
		ok, err := artifact.VerifyChecksum(art.StoragePath, art.Checksum)
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
	kind := artifact.DetectKind(art.Filename)
	result, err := artifact.Deploy(art.StoragePath, kind, installDir)
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
			"install_dir":      result.InstallDir,
			"current_version":  art.Version,
			"status":           model.StatusStopped,
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
		if err := s.procs.Stop(serviceID, svc.PID, timeout); err != nil {
			s.finishOpFail(op, err)
			return op, err
		}
	}

	// 2) 清理 install_dir(可选)
	if !keepData && svc.InstallDir != "" {
		if err := artifact.CleanDir(svc.InstallDir, false); err != nil {
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

// GetStatus 实时状态:探测 PID 存活,返回综合状态。
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
	}

	return map[string]any{
		"service_id": svc.ID,
		"status":     status,
		"pid":        svc.PID,
		"alive":      alive,
		"started_at": svc.StartedAt,
	}, nil
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
		// java -jar <command> <args>;command 用作 jar 路径
		rt, err := s.repo.GetRuntime(*svc.RuntimeID)
		if err != nil || rt.InstallPath == "" {
			return nil, fmt.Errorf("jar 服务未配置有效的运行环境: %w", ErrRuntimeRequired)
		}
		javaExe := filepath.Join(rt.InstallPath, "bin", "java.exe")
		if !fileExists(javaExe) {
			javaExe = filepath.Join(rt.InstallPath, "bin", "java")
		}
		name = javaExe
		jvmArgs := splitArgs(cfg.JVMArgs)
		args = append([]string{"-jar"}, append(jvmArgs, append([]string{cfg.Command}, splitArgs(cfg.Args)...)...)...)
		// 注入 runtime 环境变量
		cfg.EnvVars = mergeRuntimeEnv(cfg.EnvVars, rt)

	case model.ServiceTypeExe:
		name = cfg.Command
		args = splitArgs(cfg.Args)

	case model.ServiceTypeBat:
		name = "cmd.exe"
		args = []string{"/c", cfg.Command + " " + cfg.Args}

	case model.ServiceTypeSh:
		name = "bash"
		args = []string{"-c", cfg.Command + " " + cfg.Args}

	case model.ServiceTypePs1:
		name = "powershell.exe"
		args = []string{"-ExecutionPolicy", "Bypass", "-Command", cfg.Command + " " + cfg.Args}

	default:
		return nil, fmt.Errorf("不支持的服务类型: %s", svc.Type)
	}

	timeout := cfg.ShutdownTimeout
	if timeout <= 0 {
		timeout = 10
	}

	return &process.StartOptions{
		ServiceID:       svc.ID,
		LogFile:         logPath,
		Name:            name,
		Args:            args,
		Dir:             svc.WorkDir,
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

// buildEnv 把 JSON 字符串(envVars)解析为 "K=V" 切片;解析失败则忽略。
// 不含父进程环境时返回空(由 exec 继承)。
// 注意:此处 cfg.EnvVars 可能已被 mergeRuntimeEnv 改写。
func buildEnv(envVarsJSON string) []string {
	envVarsJSON = strings.TrimSpace(envVarsJSON)
	if envVarsJSON == "" {
		return nil
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(envVarsJSON), &m); err != nil {
		return nil
	}
	out := make([]string, 0, len(m))
	for k, v := range m {
		out = append(out, k+"="+v)
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

// splitArgs 简单按空白切分(不含引号语义,M2 够用)。
func splitArgs(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return strings.Fields(s)
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
