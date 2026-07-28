package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"aluka_ops/internal/config"
	"aluka_ops/internal/service"
)

// ControllerAgentsController 中心模式:Agent 注册表与远程管控。
type ControllerAgentsController struct {
	cfg *config.Config
	reg *service.ControllerRegistry
}

// NewControllerAgentsController 构造。
func NewControllerAgentsController(cfg *config.Config, reg *service.ControllerRegistry) *ControllerAgentsController {
	return &ControllerAgentsController{cfg: cfg, reg: reg}
}

// Heartbeat POST /api/agents/heartbeat — Agent 上报。
func (h *ControllerAgentsController) Heartbeat(c *gin.Context) {
	var payload map[string]any
	if err := c.ShouldBindJSON(&payload); err != nil {
		FailBind(c, err)
		return
	}
	if !h.checkAgentToken(c, payload) {
		return
	}
	view, err := h.reg.IngestHeartbeat(payload)
	if err != nil {
		Fail(c, 400, CodeErrBad, err.Error())
		return
	}
	OK(c, gin.H{
		"agent_id":     view.AgentID,
		"accepted":     true,
		"online":       view.Online,
		"last_seen_at": view.LastSeenAt,
	})
}

// List GET /api/agents
func (h *ControllerAgentsController) List(c *gin.Context) {
	OK(c, h.reg.List())
}

// Get GET /api/agents/:id
func (h *ControllerAgentsController) Get(c *gin.Context) {
	id := c.Param("id")
	view, ok := h.reg.Get(id)
	if !ok {
		FailNotFound(c, "Agent")
		return
	}
	OK(c, view)
}

// Services GET /api/agents/:id/services
// 默认返回心跳缓存;?refresh=1 实时拉取 Agent。
func (h *ControllerAgentsController) Services(c *gin.Context) {
	id := c.Param("id")
	view, ok := h.reg.Get(id)
	if !ok {
		FailNotFound(c, "Agent")
		return
	}
	if c.Query("refresh") == "1" {
		status, payload, err := h.reg.Proxy(id, http.MethodGet, "/api/agent/services", nil)
		if err != nil {
			Fail(c, 502, CodeErrSrv, "拉取失败: "+err.Error())
			return
		}
		if status >= 400 {
			Fail(c, status, CodeErrSrv, fmt.Sprintf("Agent 返回 HTTP %d", status))
			return
		}
		if data, ok := payload["data"]; ok {
			OK(c, data)
			return
		}
		OK(c, payload)
		return
	}
	OK(c, view.Services)
}

// Start POST /api/agents/:id/services/:sid/start
func (h *ControllerAgentsController) Start(c *gin.Context) {
	h.proxyAction(c, "start")
}

// Stop POST /api/agents/:id/services/:sid/stop
func (h *ControllerAgentsController) Stop(c *gin.Context) {
	h.proxyAction(c, "stop")
}

// Restart POST /api/agents/:id/services/:sid/restart
func (h *ControllerAgentsController) Restart(c *gin.Context) {
	h.proxyAction(c, "restart")
}

func (h *ControllerAgentsController) proxyAction(c *gin.Context, action string) {
	agentID := c.Param("id")
	sid := c.Param("sid")
	if _, err := strconv.ParseUint(sid, 10, 64); err != nil {
		Fail(c, 400, CodeErrBad, "无效的服务 ID")
		return
	}
	path := fmt.Sprintf("/api/agent/services/%s/%s", sid, action)
	status, payload, err := h.reg.Proxy(agentID, http.MethodPost, path, nil)
	if err != nil {
		Fail(c, 502, CodeErrSrv, err.Error())
		return
	}
	if code, ok := payload["code"].(float64); ok && int(code) != 0 {
		c.JSON(status, payload)
		return
	}
	if status >= 400 {
		c.JSON(status, payload)
		return
	}
	if data, ok := payload["data"]; ok {
		OK(c, data)
		return
	}
	OK(c, payload)
}

// checkAgentToken 校验 Agent 共享密钥。
// 未配置 ALUKA_AGENT_TOKEN 时放行;配置后要求 header/query/body 匹配。
func (h *ControllerAgentsController) checkAgentToken(c *gin.Context, payload map[string]any) bool {
	if h.cfg.AgentToken == "" {
		return true
	}
	got := c.GetHeader("X-Agent-Token")
	if got == "" {
		got = c.Query("agent_token")
	}
	if got == "" && payload != nil {
		if t, ok := payload["agent_token"].(string); ok {
			got = t
		}
	}
	if got != h.cfg.AgentToken {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
			"code":    40100,
			"message": "无效的 Agent Token",
			"data":    nil,
		})
		return false
	}
	return true
}
