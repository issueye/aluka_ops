// Package router 注册 HTTP 路由、中间件,并完成依赖组装。
//
// 依赖组装采用"构造即组装":router.New 接收已初始化的 DB/Config,
// 在内部 new 出 repository → service → controller 的完整链路。
package router

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"aluka_ops/internal/config"
	"aluka_ops/internal/controller"
	"aluka_ops/internal/pkg/artifact"
	"aluka_ops/internal/pkg/logstream"
	"aluka_ops/internal/pkg/process"
	"aluka_ops/internal/repository"
	"aluka_ops/internal/service"
)

// New 构造 Gin 引擎并注册全部路由。
func New(db *gorm.DB, cfg *config.Config, procs *process.Manager) *gin.Engine {
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
	artifactStore := artifact.NewStore(cfg.DataDir)
	serviceSvc := service.NewServiceService(db, serviceRepo, opRepo, procs, cfg.DataDir)
	// 日志分发中心(单例),注入 service 用于启动/重启后切换日志文件
	logHub := logstream.NewLogHub(cfg.DataDir)
	serviceSvc.SetLogHub(logHub)
	// 制品依赖(install/uninstall 用)
	artifactSvc := service.NewArtifactService(db, artifactRepo, serviceRepo, artifactStore)
	serviceSvc.SetArtifactDeps(artifactRepo, artifactStore)

	serviceCtl := controller.NewServiceController(serviceSvc)
	operationCtl := controller.NewOperationController(serviceSvc)
	logCtl := controller.NewLogController(serviceSvc, logHub)
	artifactCtl := controller.NewArtifactController(artifactSvc, serviceSvc)

	healthCtl := controller.NewHealthController(db, cfg)

	// ===== API =====
	api := r.Group("/api")
	{
		api.GET("/health", healthCtl.Health)

		// 运行环境(M1 垂直切片)
		rt := api.Group("/runtimes")
		{
			rt.GET("", runtimeCtl.List)
			rt.GET("/", runtimeCtl.List)
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
			svc.GET("/:id/operations", serviceCtl.Operations)

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

		// 以下路由组仅注册占位,后续阶段填充。
		registerPlaceholder(api, "/templates", "服务模板")
		registerPlaceholder(api, "/audit-logs", "审计日志")
		registerPlaceholder(api, "/dashboard", "仪表盘")

		// Agent 接口预留(单机版暂不启用上报循环)。
		agent := api.Group("/agent")
		{
			agent.GET("/status", func(c *gin.Context) {
				controller.OK(c, gin.H{
					"mode":      cfg.Mode,
					"agent":     cfg.Mode == config.ModeAgent,
					"enabled":   cfg.Mode == config.ModeAgent,
					"note":      "Agent 上报循环将在多机纳管阶段启用",
				})
			})
		}
	}

	// ===== 静态前端(embed) =====
	registerStatic(r)

	return r
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
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		c.Header("Access-Control-Allow-Credentials", "true")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
