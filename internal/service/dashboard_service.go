package service

import (
	"aluka_ops/internal/model"
	"aluka_ops/internal/repository"
)

// DashboardService 仪表盘统计。
type DashboardService struct {
	svcRepo *repository.ServiceRepository
	rtRepo  *repository.RuntimeRepository
	opRepo  *repository.OperationRepository
}

// NewDashboardService 构造。
func NewDashboardService(
	svcRepo *repository.ServiceRepository,
	rtRepo *repository.RuntimeRepository,
	opRepo *repository.OperationRepository,
) *DashboardService {
	return &DashboardService{svcRepo: svcRepo, rtRepo: rtRepo, opRepo: opRepo}
}

// Stats 汇总统计 + 异常服务 + 最近操作。
func (s *DashboardService) Stats() (map[string]any, error) {
	services, err := s.svcRepo.List(repository.ListFilter{})
	if err != nil {
		return nil, err
	}

	var total, running, stopped, crashed, created int
	abnormal := make([]model.Service, 0)
	for _, svc := range services {
		total++
		switch svc.Status {
		case model.StatusRunning:
			running++
		case model.StatusStopped:
			stopped++
		case model.StatusCrashed:
			crashed++
			abnormal = append(abnormal, svc)
		case model.StatusCreated:
			created++
		case model.StatusStopping:
			// 停止中计入运行态相关,单独不展示卡片
		default:
			// 其他状态(如 removed)不计入主卡片,异常类可扩展
			if svc.Status == model.StatusCrashed {
				abnormal = append(abnormal, svc)
			}
		}
	}

	runtimes, err := s.rtRepo.List()
	if err != nil {
		return nil, err
	}
	var rtDefault int
	for _, rt := range runtimes {
		if rt.IsDefault {
			rtDefault++
		}
	}

	ops, err := s.opRepo.ListAll("", "", 10)
	if err != nil {
		return nil, err
	}

	// 为操作记录补服务名称,便于前端展示
	nameByID := map[uint]string{}
	for _, svc := range services {
		nameByID[svc.ID] = svc.Name
	}
	recent := make([]map[string]any, 0, len(ops))
	for _, op := range ops {
		recent = append(recent, map[string]any{
			"id":           op.ID,
			"service_id":   op.ServiceID,
			"service_name": nameByID[op.ServiceID],
			"type":         op.Type,
			"status":       op.Status,
			"output_log":   op.OutputLog,
			"error_msg":    op.ErrorMsg,
			"started_at":   op.StartedAt,
			"finished_at":  op.FinishedAt,
			"created_at":   op.CreatedAt,
		})
	}

	return map[string]any{
		"services_total":    total,
		"services_running":  running,
		"services_stopped":  stopped,
		"services_crashed":  crashed,
		"services_created":  created,
		"runtimes_total":    len(runtimes),
		"runtimes_default":  rtDefault,
		"abnormal_services": abnormal,
		"recent_operations": recent,
	}, nil
}
