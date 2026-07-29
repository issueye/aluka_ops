package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"aluka_ops/internal/config"
	"aluka_ops/internal/service"
)

// 代理透传相关的默认超时
const (
	proxyHTTPTimeout = 60 * time.Second // 普通 HTTP 代理(列表/CRUD)
	proxyUploadTimeout = 10 * time.Minute // 上传等长请求
	proxyShellHandshake = 20 * time.Second // WS 握手
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

// ProxyHTTP ANY /api/agents/:id/proxy/*rest
// 透传代理:把 /api/agents/:id/proxy<rest> 原样转发到 Agent 的 <rest>。
// 支持服务/站点/文件等任意子路径,透传 method、query、header、body 与
// 响应 Content-Type/状态码;body 与响应均流式转发(支持二进制与大文件上传/下载)。
//
// 路径示例:
//
//	/api/agents/agent-01/proxy/api/services      → Agent /api/services
//	/api/agents/agent-01/proxy/api/gateway/ports → Agent /api/gateway/ports
//	/api/agents/agent-01/proxy/api/files/download?path=... → Agent /api/files/download?path=...
func (h *ControllerAgentsController) ProxyHTTP(c *gin.Context) {
	agentID := c.Param("id")
	// gin 的 *rest 含前导 "/",直接作为 Agent 侧绝对路径
	rest := c.Param("rest")
	if rest == "" || rest == "/" {
		Fail(c, 400, CodeErrBad, "缺少代理目标路径")
		return
	}

	// 透传 query
	target := rest
	if raw := c.Request.URL.RawQuery; raw != "" {
		target = rest + "?" + raw
	}

	// 选择超时:上传类(multipart/form-data 或 PUT /files/write)给更长
	timeout := proxyHTTPTimeout
	ct := c.GetHeader("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") || c.Request.Method == http.MethodPost && strings.Contains(target, "/files/upload") {
		timeout = proxyUploadTimeout
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()

	// 透传业务 header(剔除 hop-by-hop)
	headers := passthroughHeaders(c)
	result, err := h.reg.ProxyRaw(ctx, agentID, c.Request.Method, target, c.Request.Body, headers)
	if err != nil {
		Fail(c, 502, CodeErrSrv, "代理失败: "+err.Error())
		return
	}
	defer result.Body.Close()

	// 流式回写响应
	c.Writer.Header().Del("Content-Length")
	if result.ContentType != "" {
		c.Writer.Header().Set("Content-Type", result.ContentType)
	}
	c.Writer.WriteHeader(result.StatusCode)
	_, _ = io.Copy(c.Writer, result.Body)
}

// ProxyShellWS GET /api/agents/:id/shell/ws
// 控制台 WebSocket 桥接:浏览器 ↔ Controller ↔ Agent 的 /api/shell/ws。
// 隧道优先(把隧道 net.Conn 作为裸 WS 传输),直连兜底。
// 透传 shell/cols/rows 等查询参数与 X-Agent-Token;消息层双向转发(含
// 二进制 PTY 输出、文本 META/ERROR、JSON resize 控制帧)。
func (h *ControllerAgentsController) ProxyShellWS(c *gin.Context) {
	agentID := c.Param("id")
	view, ok := h.reg.Get(agentID)
	if !ok {
		FailNotFound(c, "Agent")
		return
	}
	if !view.Online {
		Fail(c, 502, CodeErrSrv, "Agent 离线: "+agentID)
		return
	}

	// 浏器侧 WS 升级
	browser, err := upgraderAdapter.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer browser.Close()

	// 拨号到 Agent 的 /api/shell/ws(隧道优先,直连兜底,均返回裸 net.Conn)
	ctx, cancel := context.WithTimeout(c.Request.Context(), proxyShellHandshake)
	defer cancel()
	agentConn, _, err := h.reg.DialShellConn(ctx, agentID)
	if err != nil {
		_ = browser.WriteMessage(websocket.TextMessage, []byte("\x1eERROR:"+err.Error()+"\n"))
		return
	}

	// 把裸 net.Conn 作为 WS 客户端传输(URL host 仅用于拼装请求行,连接已被劫持)
	wsURL, _ := url.Parse(shellWSURL(view, c.Request.URL.RawQuery))
	if wsURL == nil {
		_ = agentConn.Close()
		_ = browser.WriteMessage(websocket.TextMessage, []byte("\x1eERROR:bad ws url\n"))
		return
	}
	requestHeader := http.Header{}
	if h.cfg.AgentToken != "" {
		requestHeader.Set("X-Agent-Token", h.cfg.AgentToken)
	}
	// 握手超时通过底层连接 deadline 控制
	_ = agentConn.SetDeadline(time.Now().Add(proxyShellHandshake))
	agent, _, err := websocket.NewClient(agentConn, wsURL, requestHeader, 8*1024, 8*1024)
	if err != nil {
		_ = agentConn.Close()
		_ = browser.WriteMessage(websocket.TextMessage, []byte("\x1eERROR:ws handshake: "+err.Error()+"\n"))
		return
	}
	_ = agentConn.SetDeadline(time.Time{}) // 清除 deadline,交给 WS ping/读循环
	defer agent.Close()

	// 双向消息转发:任一侧断开则整体结束
	done := make(chan struct{}, 2)
	// browser → agent
	go func() {
		defer func() { done <- struct{}{} }()
		bridgeWS(browser, agent)
	}()
	// agent → browser
	go func() {
		defer func() { done <- struct{}{} }()
		bridgeWS(agent, browser)
	}()
	<-done
}

// bridgeWS 从 src 读消息并原样写入 dst,直到出错返回。
func bridgeWS(src, dst *websocket.Conn) {
	for {
		mt, data, err := src.ReadMessage()
		if err != nil {
			return
		}
		_ = dst.SetWriteDeadline(time.Now().Add(30 * time.Second))
		if err := dst.WriteMessage(mt, data); err != nil {
			return
		}
	}
}

// passthroughHeaders 收集需要透传给 Agent 的业务请求头。
// 剔除 hop-by-hop 与由 Agent 自行决定的头(如 Host、Content-Length、Authorization)。
func passthroughHeaders(c *gin.Context) map[string]string {
	skip := map[string]bool{
		"host": true, "content-length": true, "connection": true,
		"keep-alive": true, "proxy-authenticate": true, "proxy-authorization": true,
		"te": true, "trailer": true, "transfer-encoding": true, "upgrade": true,
		"authorization": true,
	}
	out := map[string]string{}
	for k, vs := range c.Request.Header {
		if skip[strings.ToLower(k)] {
			continue
		}
		if len(vs) > 0 {
			out[k] = vs[0]
		}
	}
	return out
}

// shellWSURL 构造到 Agent /api/shell/ws 的 URL。直连用 APIBase;隧道用 loopback 占位。
func shellWSURL(view *service.AgentView, rawQuery string) string {
	u := "ws://"
	host := "127.0.0.1:" + strconv.Itoa(view.HTTPPort)
	if view.APIBase != "" {
		// 直连:从 api_base 推导 ws host
		ab := strings.TrimPrefix(strings.TrimPrefix(view.APIBase, "http://"), "https://")
		if i := strings.IndexByte(ab, '/'); i >= 0 {
			ab = ab[:i]
		}
		if ab != "" {
			host = ab
		}
	}
	u += host + "/api/shell/ws"
	if rawQuery != "" {
		u += "?" + rawQuery
	}
	return u
}

// upgraderAdapter 复用通用 WS 升级器(允许所有来源,鉴权由上层中间件负责)。
var upgraderAdapter = websocket.Upgrader{
	ReadBufferSize:  8192,
	WriteBufferSize: 8192,
	CheckOrigin:     func(r *http.Request) bool { return true },
}
