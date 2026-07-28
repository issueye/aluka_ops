package controller

import (
	"crypto/subtle"
	"net/http"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/config"
	"aluka_ops/internal/repository"
	"aluka_ops/internal/service"
)

// AgentController 供中心 Controller 调用的 Agent 侧 API。
type AgentController struct {
	cfg   *config.Config
	agent *service.AgentService
	svc   *service.ServiceService
}

// NewAgentController 构造。
func NewAgentController(cfg *config.Config, agent *service.AgentService, svc *service.ServiceService) *AgentController {
	return &AgentController{cfg: cfg, agent: agent, svc: svc}
}

// Info GET /api/agent/info — Agent 完整快照。
func (h *AgentController) Info(c *gin.Context) {
	if !h.allow(c) {
		return
	}
	OK(c, h.agent.Snapshot())
}

// Status GET /api/agent/status — 精简状态。
func (h *AgentController) Status(c *gin.Context) {
	if !h.allow(c) {
		return
	}
	snap := h.agent.Snapshot()
	OK(c, gin.H{
		"agent_id":   snap["agent_id"],
		"mode":       snap["mode"],
		"version":    snap["version"],
		"host":       snap["host"],
		"services":   snap["services"],
		"heartbeat":  snap["heartbeat"],
		"timestamp":  snap["timestamp"],
		"enabled":    h.cfg.IsAgentMode(),
		"controller": h.cfg.ControllerURL,
	})
}

// Services GET /api/agent/services — 本机服务列表。
func (h *AgentController) Services(c *gin.Context) {
	if !h.allow(c) {
		return
	}
	items, err := h.svc.List(repository.ListFilter{
		Name:   c.Query("name"),
		Status: c.Query("status"),
		Type:   c.Query("type"),
	})
	if err != nil {
		FailServer(c, err)
		return
	}
	OK(c, items)
}

// Start POST /api/agent/services/:id/start
func (h *AgentController) Start(c *gin.Context) {
	if !h.allow(c) {
		return
	}
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	op, err := h.svc.Start(id)
	if err != nil {
		if op != nil {
			c.JSON(200, gin.H{"code": CodeErrSrv, "message": err.Error(), "data": gin.H{"operation": op}})
			return
		}
		respondServiceErr(c, err)
		return
	}
	OK(c, gin.H{"operation": op})
}

// Stop POST /api/agent/services/:id/stop
func (h *AgentController) Stop(c *gin.Context) {
	if !h.allow(c) {
		return
	}
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	op, err := h.svc.Stop(id)
	if err != nil {
		if op != nil {
			c.JSON(200, gin.H{"code": CodeErrSrv, "message": err.Error(), "data": gin.H{"operation": op}})
			return
		}
		respondServiceErr(c, err)
		return
	}
	OK(c, gin.H{"operation": op})
}

// Restart POST /api/agent/services/:id/restart
func (h *AgentController) Restart(c *gin.Context) {
	if !h.allow(c) {
		return
	}
	id, err := parseID(c)
	if err != nil {
		FailBind(c, err)
		return
	}
	op, err := h.svc.Restart(id)
	if err != nil {
		if op != nil {
			c.JSON(200, gin.H{"code": CodeErrSrv, "message": err.Error(), "data": gin.H{"operation": op}})
			return
		}
		respondServiceErr(c, err)
		return
	}
	OK(c, gin.H{"operation": op})
}

// allow 校验 Agent Token(若配置了)或已通过用户鉴权。
func (h *AgentController) allow(c *gin.Context) bool {
	if h.cfg.AgentToken == "" {
		return true
	}
	got := c.GetHeader("X-Agent-Token")
	if got == "" {
		got = c.Query("agent_token")
	}
	if subtle.ConstantTimeCompare([]byte(got), []byte(h.cfg.AgentToken)) == 1 {
		c.Set("operator", "controller")
		return true
	}
	if op, ok := c.Get("operator"); ok {
		if s, ok2 := op.(string); ok2 && s != "" {
			return true
		}
	}
	if !h.cfg.AuthEnabled() {
		return true
	}
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
		"code":    40100,
		"message": "需要有效的 Agent Token 或用户登录",
		"data":    nil,
	})
	return false
}
