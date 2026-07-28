// Package router 注册 HTTP 路由、中间件,并完成依赖组装。
//
// 依赖组装采用"构造即组装":router.New 接收已初始化的 DB/Config,
// 在内部 new 出 repository → service → controller 的完整链路。
package router

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"aluka_ops/internal/config"
	"aluka_ops/internal/controller"
	"aluka_ops/internal/middleware"
	"aluka_ops/internal/pkg/agent"
	"aluka_ops/internal/pkg/artifact"
	"aluka_ops/internal/pkg/auth"
	"aluka_ops/internal/pkg/files"
	"aluka_ops/internal/pkg/gateway"
	"aluka_ops/internal/pkg/healthcheck"
	"aluka_ops/internal/pkg/hostinfo"
	"aluka_ops/internal/pkg/logstream"
	"aluka_ops/internal/pkg/process"
	"aluka_ops/internal/pkg/shell"
	"aluka_ops/internal/repository"
	"aluka_ops/internal/service"
)

// New 构造 Gin 引擎并注册全部路由。
// 返回 stop 函数用于停止 Agent 心跳等后台任务。
func New(db *gorm.DB, cfg *config.Config, procs *process.Manager) (*gin.Engine, func()) {
	if cfg.Mode != config.ModeAgent {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(corsMiddleware(cfg.AllowOrigin))

	// ===== 依赖组装 =====
	runtimeRepo := repository.NewRuntimeRepository(db)
	runtimeSvc := service.NewRuntimeService(db, runtimeRepo)
	runtimeCtl := controller.NewRuntimeController(runtimeSvc)

	serviceRepo := repository.NewServiceRepository(db)
	opRepo := repository.NewOperationRepository(db)
	artifactRepo := repository.NewArtifactRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	artifactStore := artifact.NewStore(cfg.DataDir)
	serviceSvc := service.NewServiceService(db, serviceRepo, opRepo, procs, cfg.DataDir)
	// 日志分发中心(单例),注入 service 用于启动/重启后切换日志文件
	logHub := logstream.NewLogHub(cfg.DataDir)
	serviceSvc.SetLogHub(logHub)
	// 制品依赖(install/uninstall 用)
	artifactSvc := service.NewArtifactService(db, artifactRepo, serviceRepo, artifactStore)
	serviceSvc.SetArtifactDeps(artifactRepo, artifactStore)
	// 健康检查后台轮询
	healthMon := healthcheck.NewMonitor(func() map[uint]healthcheck.Config {
		return serviceSvc.HealthProbeTargets()
	})
	serviceSvc.SetHealthMonitor(healthMon)
	healthMon.Start()
	auditSvc := service.NewAuditService(auditRepo)

	serviceCtl := controller.NewServiceController(serviceSvc)
	operationCtl := controller.NewOperationController(serviceSvc)
	logCtl := controller.NewLogController(serviceSvc, logHub)
	artifactCtl := controller.NewArtifactController(artifactSvc, serviceSvc)
	dashboardSvc := service.NewDashboardService(serviceRepo, runtimeRepo, opRepo)
	dashboardCtl := controller.NewDashboardController(dashboardSvc)
	auditCtl := controller.NewAuditController(auditSvc)
	templateRepo := repository.NewTemplateRepository(db)
	templateSvc := service.NewTemplateService(db, templateRepo, serviceRepo)
	templateCtl := controller.NewTemplateController(templateSvc)
	agentSvc := service.NewAgentService(cfg, serviceRepo, runtimeRepo)
	agentCtl := controller.NewAgentController(cfg, agentSvc, serviceSvc)
	// Controller 模式:Agent 注册表
	ctrlReg := service.NewControllerRegistry(cfg)
	ctrlAgentsCtl := controller.NewControllerAgentsController(cfg, ctrlReg)

	healthCtl := controller.NewHealthController(db, cfg)
		// 本机主机信息采集(缓存 3s,供仪表盘定时拉取)
		hostCollector := hostinfo.NewCollector(3 * time.Second)
		systemCtl := controller.NewSystemController(hostCollector)
		// 文件管理:仅允许 data 目录内操作
		fileStore, err := files.NewStore(cfg.DataDir)
		if err != nil {
			panic("初始化文件管理根目录失败: " + err.Error())
		}
		fileCtl := controller.NewFileController(fileStore)
		// 网关:代理端口 + APP(静态) + 端口反代
		gwMgr := gateway.NewManager(cfg.DataDir)
		portRepo := repository.NewGatewayPortRepository(db)
		appRepo := repository.NewAppRepository(db)
		proxyRepo := repository.NewPortProxyRepository(db)
		scriptRepo := repository.NewPortScriptRepository(db)
		gatewayRepo := repository.NewGatewayRepository(db)
		appGwSvc := service.NewAppGatewayService(portRepo, appRepo, proxyRepo, scriptRepo, gwMgr, cfg.DataDir)
		appGwSvc.SetLegacyRepo(gatewayRepo)
		gatewaySvc := service.NewGatewayService(gatewayRepo, gwMgr)
		gatewaySvc.SetReload(appGwSvc.Reload)
		if err := appGwSvc.Reload(); err != nil {
			_ = err
		}
		appCtl := controller.NewAppController(appGwSvc)
		gatewayCtl := controller.NewGatewayController(gatewaySvc)
		// 鉴权:ALUKA_PASSWORD 非空时启用
		authStore := auth.NewStore(cfg.AuthPassword, cfg.AuthTokenTTLHours)
		authCtl := controller.NewAuthController(authStore)

		// 服务器级 Web 控制台(Windows 默认 PowerShell)
		shellMgr := shell.NewManager(cfg.DataDir, 4)
		shellCtl := controller.NewShellController(shellMgr)

		// ===== API =====
		api := r.Group("/api")
		// 鉴权(未配置密码时自动放行;Agent Token 可访问 /api/agent/*)
		api.Use(middleware.AuthRequired(authStore, cfg.AgentToken))
		// 写操作审计(成功后落库)
		api.Use(middleware.AuditWrite(auditSvc))
		{
			api.GET("/health", healthCtl.Health)

			// 本机系统信息(CPU/内存/磁盘),前端定时拉取
			sys := api.Group("/system")
			{
				sys.GET("/host", systemCtl.Host)
			}

			// 服务器控制台 WebSocket / REST
			sh := api.Group("/shell")
			{
				sh.GET("/info", shellCtl.Info)
				sh.GET("/sessions", shellCtl.ListSessions)
				sh.DELETE("/sessions/:id", shellCtl.CloseSession)
				sh.GET("/ws", shellCtl.WS)
			}

			// 文件管理(限定 data 目录)
			fg := api.Group("/files")
			{
				fg.GET("", fileCtl.List)
				fg.GET("/", fileCtl.List)
				fg.GET("/stat", fileCtl.Stat)
				fg.GET("/read", fileCtl.Read)
				fg.GET("/download", fileCtl.Download)
				fg.POST("/mkdir", fileCtl.Mkdir)
				fg.POST("/upload", fileCtl.Upload)
				fg.PUT("/write", fileCtl.Write)
				fg.PUT("/rename", fileCtl.Rename)
				fg.DELETE("", fileCtl.Delete)
			}

			// 代理端口 / APP / 端口反代
			gw := api.Group("/gateway")
			{
				gw.GET("/status", appCtl.Status)
				gw.POST("/reload", appCtl.Reload)

				// 代理端口
				gw.GET("/ports", appCtl.ListPorts)
				gw.GET("/ports/", appCtl.ListPorts)
				gw.POST("/ports", appCtl.CreatePort)
				gw.GET("/ports/:id", appCtl.GetPort)
				gw.PUT("/ports/:id", appCtl.UpdatePort)
				gw.DELETE("/ports/:id", appCtl.DeletePort)

				// APP(静态前端)
				gw.GET("/apps", appCtl.ListApps)
				gw.GET("/apps/", appCtl.ListApps)
				gw.POST("/apps", appCtl.CreateApp)
				gw.GET("/apps/:id", appCtl.GetApp)
				gw.PUT("/apps/:id", appCtl.UpdateApp)
				gw.DELETE("/apps/:id", appCtl.DeleteApp)

				// 反代规则(挂在端口下)
				gw.GET("/proxies", appCtl.ListProxies)
				gw.GET("/proxies/", appCtl.ListProxies)
				gw.POST("/proxies", appCtl.CreateProxy)
				gw.GET("/proxies/:id", appCtl.GetProxy)
				gw.PUT("/proxies/:id", appCtl.UpdateProxy)
				gw.DELETE("/proxies/:id", appCtl.DeleteProxy)

				// 路由脚本预设(须在 /scripts/:id 前注册)
				gw.GET("/script-templates", appCtl.ListScriptTemplates)
				gw.GET("/script-templates/", appCtl.ListScriptTemplates)
				gw.GET("/script-templates/:id", appCtl.GetScriptTemplate)

				// 路由脚本(挂在端口下,优先于 APP/反代)
				gw.GET("/scripts", appCtl.ListScripts)
				gw.GET("/scripts/", appCtl.ListScripts)
				gw.POST("/scripts", appCtl.CreateScript)
				gw.GET("/scripts/:id", appCtl.GetScript)
				gw.PUT("/scripts/:id", appCtl.UpdateScript)
				gw.DELETE("/scripts/:id", appCtl.DeleteScript)

				// 旧扁平 rules(兼容,可选)
				gw.GET("/rules", gatewayCtl.List)
				gw.POST("/rules", gatewayCtl.Create)
				gw.GET("/rules/:id", gatewayCtl.Get)
				gw.PUT("/rules/:id", gatewayCtl.Update)
				gw.DELETE("/rules/:id", gatewayCtl.Delete)
			}

			// 认证
			authG := api.Group("/auth")
		{
			authG.GET("/status", authCtl.Status)
			authG.POST("/login", authCtl.Login)
			authG.POST("/logout", authCtl.Logout)
		}

		// 运行环境
		rt := api.Group("/runtimes")
		{
			rt.GET("", runtimeCtl.List)
			rt.GET("/", runtimeCtl.List)
			// detect 必须在 /:id 之前注册,避免被当成 id
			rt.GET("/detect", runtimeCtl.Detect)
			rt.POST("", runtimeCtl.Create)
			rt.GET("/:id", runtimeCtl.Get)
			rt.PUT("/:id", runtimeCtl.Update)
			rt.DELETE("/:id", runtimeCtl.Delete)
		}

		// 服务管理(M2 核心实现)
		svc := api.Group("/services")
		{
			svc.GET("", serviceCtl.List)
			svc.GET("/", serviceCtl.List)
			svc.POST("", serviceCtl.Create)
			svc.GET("/:id", serviceCtl.Get)
			svc.PUT("/:id", serviceCtl.Update)
			svc.DELETE("/:id", serviceCtl.Delete)

			// 生命周期动作
			svc.POST("/:id/start", serviceCtl.Start)
			svc.POST("/:id/stop", serviceCtl.Stop)
			svc.POST("/:id/restart", serviceCtl.Restart)
				svc.GET("/:id/status", serviceCtl.Status)
				svc.GET("/:id/config", serviceCtl.GetConfig)
				svc.PUT("/:id/config", serviceCtl.UpdateConfig)
				svc.GET("/:id/operations", serviceCtl.Operations)
			// 控制台:向进程 stdin 写入(配合前端 xterm + 日志 SSE)
			svc.POST("/:id/console", serviceCtl.ConsoleInput)

			// 日志(M3:SSE 实时流 + 历史查询 + 下载)
			svc.GET("/:id/logs", logCtl.History)
			svc.GET("/:id/logs/stream", logCtl.Stream)
			svc.GET("/:id/logs/file", logCtl.Download)

			// 制品管理与安装/卸载(M4)
			svc.GET("/:id/artifacts", artifactCtl.List)
			svc.POST("/:id/artifacts", artifactCtl.Upload)
			svc.GET("/:id/artifacts/:aid", artifactCtl.Get)
			svc.DELETE("/:id/artifacts/:aid", artifactCtl.Delete)
			svc.GET("/:id/artifacts/:aid/download", artifactCtl.Download)
			svc.POST("/:id/install", artifactCtl.Install)
			svc.POST("/:id/uninstall", artifactCtl.Uninstall)
			svc.POST("/:id/upgrade", artifactCtl.Upgrade)
			svc.POST("/:id/rollback", artifactCtl.Rollback)
		}

		// 操作记录(M2 实现)
		ops := api.Group("/operations")
		{
			ops.GET("", operationCtl.List)
			ops.GET("/", operationCtl.List)
			ops.GET("/:id", operationCtl.Get)
		}

			// 仪表盘
			dash := api.Group("/dashboard")
			{
				dash.GET("/stats", dashboardCtl.Stats)
			}

			// 审计日志
			audit := api.Group("/audit-logs")
			{
				audit.GET("", auditCtl.List)
				audit.GET("/", auditCtl.List)
				audit.GET("/:id", auditCtl.Get)
			}

			// 服务模板
			tpl := api.Group("/templates")
			{
				tpl.GET("", templateCtl.List)
				tpl.GET("/", templateCtl.List)
				tpl.POST("", templateCtl.Create)
				// apply 须在 /:id 的子路径,Gin 支持
				tpl.POST("/:id/apply", templateCtl.Apply)
				tpl.GET("/:id", templateCtl.Get)
				tpl.PUT("/:id", templateCtl.Update)
				tpl.DELETE("/:id", templateCtl.Delete)
			}

			// Agent 侧 API(供中心 Controller 查询/下发启停)
			agentG := api.Group("/agent")
			{
				agentG.GET("/status", agentCtl.Status)
				agentG.GET("/info", agentCtl.Info)
				agentG.GET("/services", agentCtl.Services)
				agentG.POST("/services/:id/start", agentCtl.Start)
				agentG.POST("/services/:id/stop", agentCtl.Stop)
				agentG.POST("/services/:id/restart", agentCtl.Restart)
			}

			// 中心 Controller:接收心跳 + 多节点管控
			agents := api.Group("/agents")
			{
				agents.POST("/heartbeat", ctrlAgentsCtl.Heartbeat)
				agents.GET("", ctrlAgentsCtl.List)
				agents.GET("/", ctrlAgentsCtl.List)
				agents.GET("/:id", ctrlAgentsCtl.Get)
				agents.GET("/:id/services", ctrlAgentsCtl.Services)
				agents.POST("/:id/services/:sid/start", ctrlAgentsCtl.Start)
				agents.POST("/:id/services/:sid/stop", ctrlAgentsCtl.Stop)
				agents.POST("/:id/services/:sid/restart", ctrlAgentsCtl.Restart)
			}
		}

	// ===== 静态前端(embed) =====
		registerStatic(r)

		// Agent 心跳上报
		hb := agent.NewHeartbeatLoop(cfg, agentSvc)
		hb.Start()
		stop := func() {
			hb.Stop()
			gwMgr.Close()
			shellMgr.CloseAll()
		}

		return r, stop
	}

// registerPlaceholder 为尚未实现的路由组注册统一占位 handler。
// 覆盖常见 CRUD 方法,统一返回 501。
func registerPlaceholder(rg *gin.RouterGroup, path, name string) {
	g := rg.Group(path)
	any := func(c *gin.Context) { controller.NotImplemented(c, name) }
	g.GET("", any)
	g.GET("/", any)
	g.POST("", any)
	g.GET("/:id", any)
	g.PUT("/:id", any)
	g.POST("/:id/:action", any) // 例如 services/:id/start
	g.DELETE("/:id", any)
}

// corsMiddleware 简易 CORS(开发期前端跑在 5173,需跨域访问 8080)。
func corsMiddleware(allowOrigin string) gin.HandlerFunc {
	allowOrigin = strings.TrimSpace(allowOrigin)
	return func(c *gin.Context) {
		origin := allowOrigin
		if allowOrigin == "*" {
			origin = c.Request.Header.Get("Origin")
			if origin == "" {
				origin = "*"
			}
		}
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Token, X-Operator")
		c.Header("Access-Control-Allow-Credentials", "true")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
