# Aluka Ops · 服务治理系统

> 面向单机的轻量级服务治理面板:把散落在机器上的服务进程(Jar / exe / 脚本)及其依赖的运行环境(JDK 等)纳入统一管理,实现安装、启停、升级、卸载与环境隔离的可视化治理。架构上预留 **Agent 化**能力,未来可由中心 Controller 纳管多机。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Go 1.25 · Gin · GORM · SQLite(纯 Go 驱动 `glebarez/sqlite`,免 CGO) |
| 架构 | MVC分层:`controller / service / repository / model` |
| 前端 | React 18 + Vite 5(**JS**) · Tailwind CSS v3 · shadcn/ui(Radix) |
| 状态 | TanStack Query · React Router |
| 部署 | Go `embed` 内嵌前端,产出**单二进制** |

## 当前阶段:服务治理 + 网关/APP/文件管理

### ✅ M1 骨架(已完成)

- 后端 MVC 分层、GORM/SQLite 初始化、全表 AutoMigrate、种子数据
- `/api/health` 健康检查、`/api/runtimes` 完整 CRUD(含默认环境互斥)
- 前端 App Shell(侧边栏 + 顶栏 + 健康指示)、仪表盘、环境管理 CRUD 页
- 单二进制构建:前端嵌入后端,SPA fallback、静态资源、API 同时可用

### ✅ M2 服务生命周期管理(已完成)

**核心能力:服务的创建、启动、停止、重启、状态查询。**

- 跨平台进程管理器(`internal/pkg/process/`):
  - Windows:独立进程组(`CREATE_NEW_PROCESS_GROUP`)、Ctrl+Break 优雅停止、`taskkill /T /F` 强杀整树、`tasklist` 探活
  - Unix:`Setpgid`、SIGTERM 优雅停止、`kill -PGID` 强杀、`signal 0` 探活
  - stdout/stderr 合并重定向到日志文件(`data/logs/<code>/`)
- 服务 CRUD + 生命周期动作接口:
  - `POST /api/services` 创建(同时建初始 ServiceConfig)
  - `POST /:id/start | /stop | /restart` 启停重启
  - `GET /:id/status` 实时探活(DB running 但进程已死 → 自动标 crashed)
  - `DELETE /:id` 删除(运行中禁止)
- 按服务类型自动拼装启动命令(jar 走 java -jar + 绑定 JDK,exe/bat/sh/ps1 各自方式)
- Runtime 环境变量注入(JAVA_HOME / PATH 占位符渲染)
- **Operation 留痕**:每次 start/stop/restart 记录一条操作(success/failed + 输出)
- 前端:服务列表(状态徽章 + 5s 轮询 + 行内启停按钮)、服务详情(概览/配置/操作记录 Tab)、新建服务表单

### ✅ M3 日志实时查看(已完成)

**核心能力:服务运行日志的 SSE 实时流式查看(类似 `kubectl logs -f`)。**

- 日志流分发中心(`internal/pkg/logstream/`):
  - `tail.go`:文件尾部 N 行读取 + offset 增量读取 + 截断检测
  - `hub.go`:LogHub 单例,每服务一个 tail goroutine(200ms 轮询),多订阅者广播
  - 服务重启生成新日志文件 → 自动切换跟踪(从 0 重读)
- SSE 接口:
  - `GET /api/services/:id/logs/stream?lines=200` 实时流(meta/history/log/end 事件)
  - `GET /api/services/:id/logs?lines=1000` 历史尾部(JSON)
  - `GET /api/services/:id/logs/file` 日志文件下载
- 前端 LogViewer:终端风格面板、自动滚动(上滑暂停)、清屏、暂停/继续、连接状态指示、重连、下载
- 详情页新增「日志」Tab,激活时建立 SSE 连接、切走时关闭(无资源泄漏)

> 后续阶段(M5+):升级/回滚、配置编辑、监控仪表盘、Agent 上报。

### ✅ M4 制品管理 + 安装/卸载(已完成)

**核心能力:从制品包部署服务、一键卸载(补全"安装、移除")。**

- 制品管理(`internal/pkg/artifact/`):
  - `store.go`:上传保存(边写边算 SHA256)、校验、单文件/zip 识别
  - `deploy.go`:单文件复制 / zip 解压部署,**原子替换**(先部署到 .new,成功后替换,失败回滚)、Zip Slip 路径穿越防护、解压后自动探测主入口(jar>exe>bat>ps1)
- 制品接口(归属服务):
  - `POST /api/services/:id/artifacts` 上传(multipart:file+version)
  - `GET/DELETE` 制品列表、详情、删除(当前版本禁删)、下载
- 安装 / 卸载:
  - `POST /api/services/:id/install?artifact_id=X` 部署到 install_dir,标记当前版本,运行中先停止
  - `POST /api/services/:id/uninstall` 停服 + 清理目录 + 重置版本
- 安装时若服务配置 command 为空,自动用探测到的入口文件填充
- 前端:详情页新增「版本」Tab(制品列表/上传/安装/卸载/删除/下载,二次确认)

### ✅ M5 升级/回滚(已完成 · 原始需求全部实现)

**核心能力:一键升级到新版本、回滚到历史版本,部署失败自动回滚。**

- 升级 / 回滚接口:
  - `POST /api/services/:id/upgrade?artifact_id=X` 升级到指定制品
  - `POST /api/services/:id/rollback?artifact_id=X` 回滚到历史制品(校验:不能回滚到当前版本)
- 复用 M4 的 `deployWithOpType` 部署逻辑,Operation 类型标记为 `upgrade`
- **部署失败自动回滚**:由 M4 原子替换保证——部署失败时 `install_dir` 仍是旧版本,DB 未改动,服务状态完全不变
- 前端:版本 Tab 每个历史版本按版本号显示「升级」或「回滚」按钮,二次确认,部署失败时提示已自动回滚

### ✅ 服务控制台(xterm.js)

**核心能力:服务详情「控制台」Tab,交互式终端风格。**

- 输出:订阅日志 SSE 实时流,写入 xterm
- 输入:行缓冲 + 回车,`POST /api/services/:id/console` 写入进程 stdin
- 进程启动时保留 `StdinPipe`,仅本实例拉起的进程可交互
- 前端:`@xterm/xterm` + FitAddon + WebLinksAddon

### ✅ 配置在线编辑 + 崩溃自动拉起

- `PUT /api/services/:id/config`:编辑 command/args/jvm/env/port/自动拉起等
  - 运行中仅允许改 `auto_restart` / `max_restarts` / `shutdown_timeout`
  - 启动相关字段需停服后修改
- 进程意外退出 → 状态 `crashed` → 若开启 `auto_restart`,按 1s/2s/4s… 退避自动拉起
  - 最多 `max_restarts` 次;用户手动 start/stop/restart 会重置计数
  - 5 分钟无新崩溃则计数清零
- 前端:服务详情「配置」Tab 可编辑表单

### ✅ 审计日志 + 本机 JDK 探测

- 写操作中间件自动落库 `audit_logs`(成功 POST/PUT/DELETE)
- 前端「审计日志」页:筛选动作/对象、时间线列表
- `GET /api/runtimes/detect`:扫描 JAVA_HOME / PATH / 常见安装目录
- 环境管理页「探测本机 JDK」一键登记

### ✅ 健康检查探针(HTTP/TCP)

- 配置 `health_check` JSON:`{type, target, interval_sec, timeout_sec}`
- 后台 Monitor 按间隔轮询 running 服务;status/详情接口返回 `health` 字段
- target 可留空,自动用 `port` 推导 `127.0.0.1:port` 或 `http://127.0.0.1:port/`
- 前端配置 Tab 可选 none/http/tcp;概览展示健康徽章与延迟

### ✅ 登录鉴权

- 默认必须配置管理密码:环境变量 `ALUKA_PASSWORD` 或命令行 `-password`
- 未配置管理密码时服务拒绝启动;仅本地开发/受控测试可显式设置 `ALUKA_ALLOW_NO_AUTH=true` 或 `-allow-no-auth` 放行
- 签发随机 Token(内存存储),默认 24h 有效;`Authorization: Bearer` 或 `?token=`(SSE/WebSocket)
- Agent/Controller 模式默认必须配置 `ALUKA_AGENT_TOKEN`;仅本地开发/受控测试可显式设置 `ALUKA_ALLOW_EMPTY_AGENT_TOKEN=true` 或 `-allow-empty-agent-token` 放行
- 前端:登录页 + AuthGate 门禁 + 顶栏退出

### ✅ 服务模板

- 模板 CRUD:`config_template` JSON 支持 `{{var}}` 占位
- `POST /api/templates/:id/apply` 渲染变量并创建服务(绑定 template_id)
- 前端「服务模板」页:编辑配方、一键创建服务并跳转详情

### ✅ Agent 模式 + 中心 Controller 模式

同一二进制支持三种模式:

| 模式 | `ALUKA_MODE` | 说明 |
|------|--------------|------|
| 单机面板 | `standalone`(默认) | 本机服务治理 |
| Agent | `agent` | 向中心上报心跳,接受远程启停 |
| 中心 | `controller` | 接收心跳,多节点列表与远程管控 |

**Agent 侧**
- `/api/agent/status|info|services` + start/stop/restart
- 心跳: `POST {CONTROLLER}/api/agents/heartbeat`
- 需配置 `ALUKA_ADVERTISE_URL` 供中心回连

**Controller 侧**
- `POST /api/agents/heartbeat` 接收上报
- `GET /api/agents` 多节点列表(在线/离线)
- `POST /api/agents/:id/services/:sid/{start,stop,restart}` 远程代理
- 前端「多节点」页展示 Agent 与远程操作按钮

```bash
# 中心
ALUKA_MODE=controller ALUKA_PORT=19090 ALUKA_AGENT_TOKEN=tok ./bin/aluka_ops.exe

# 节点 Agent
	ALUKA_MODE=agent ALUKA_PORT=18080 \
	ALUKA_CONTROLLER_URL=http://中心:19090 \
	ALUKA_AGENT_TOKEN=tok \
	ALUKA_ADVERTISE_URL=http://本机IP:18080 \
		./bin/aluka_ops.exe
		```

	### ✅ 流量隧道(反向 TCP · 中心中继)

	内网 Agent **主动**连中心 WebSocket,中心按规则在本地 `listen_port` 接受连接,经隧道转发到 Agent 侧 `remote_host:remote_port`(类似 `ssh -R`)。适配 NAT:无需中心回拨 Agent。

	| 能力 | 说明 |
	|------|------|
	| 数据面 | `/api/tunnel/ws` + 自研二进制多路复用帧 |
	| 规则 | `reverse_tcp`:中心听 → Agent 拨远端(默认仅 loopback/私网) |
	| 管理 API | `GET/POST /api/tunnels`、`PUT/DELETE /:id`、`POST /:id/enable`、`GET /sessions` |
	| 前端 | 侧边栏「流量隧道」:规则 CRUD、会话状态、活跃连接数 |

	```bash
	# 中心(或 standalone 也可承载隧道)
	./bin/aluka_ops.exe -mode controller -port 19090 -agent-token secret

	# 内网 Agent
	./bin/aluka_ops.exe -mode agent -port 18080 \
	  -controller-url http://中心:19090 -agent-token secret -agent-id office-1

	# 在中心 UI 或 API 创建规则: listen_port=18090 → office-1 的 127.0.0.1:8080
	# 外网访问 http://中心:18090 → 内网服务
	curl -X POST http://中心:19090/api/tunnels -H 'Content-Type: application/json' -d '{
	  "code":"office-web","name":"办公网 Web","agent_id":"office-1",
	  "listen_port":18090,"remote_host":"127.0.0.1","remote_port":8080,"enabled":true
	}'
	```

	### ✅ 本机主机信息定时采集

	- `GET /api/system/host`:CPU/内存/磁盘/进程数/运行时长(3s 服务端缓存)
	- 仪表盘每 5 秒刷新「当前服务器」卡片;设置页同步展示

	### ✅ 文件管理(限定 data 目录)

	- 仅可操作 `ALUKA_DATA_DIR` 内路径(防穿越)
	- 浏览 / 上传 / 下载 / 新建目录与文件 / 文本编辑 / 重命名 / 删除
	- 前端「文件管理」页

	### ✅ 站点管理(端口 + APP + 反代 + 路由脚本)

	类似 nginx 的轻量网关。前端以「站点」管理一个监听端口,进入站点后配置:

	| 实体 | 说明 |
	|------|------|
	| **站点** | 动态 Listen 端口,启停控制(侧边栏「站点管理」) |
	| **APP** | 站点内静态前端:路径前缀、root_dir、SPA fallback |
	| **反代** | 站点内路径前缀 → upstream;流式转发,适合大文件上传 |
	| **路由脚本** | 站点内优先执行;JSON 规则 rewrite/redirect/deny/proxy/static |

	反代上传友好默认:`max_body_bytes=0`、`io_timeout_sec=0`(不限制 body/长传)。

	```bash
	# 示例:站点 :18100 托管静态站 + /api 反代
	# 1) 站点管理 → 新建站点 18100
	# 2) 进入站点 → APP path=/ root=apps/web
	# 3) 反代 Tab → path=/api upstream=http://127.0.0.1:8080
	# 访问 http://127.0.0.1:18100/ 与 http://127.0.0.1:18100/api/...
	```
	
	## 目录结构

```
aluka_ops/
├── cmd/server/main.go              # 入口
├── internal/
│   ├── config/                     # 配置(env)
│   ├── model/                      # GORM 实体(全表)
│   ├── repository/                 # 数据访问层(service/runtime/operation)
│   ├── service/                    # 业务逻辑层(含进程编排)
│   ├── controller/                 # HTTP handler + 统一响应
│   ├── router/                     # 路由 + 中间件 + SPA 托管
│   └── pkg/
│       ├── db/                     # GORM 初始化 + 迁移 + seed
│       ├── process/                # 跨平台进程管理器(M2 核心)
│       ├── logstream/              # 日志 tail + SSE 多订阅广播(M3 核心)
│       └── artifact/               # 制品存储 + 部署(复制/解压)(M4 核心)
├── web/                            # 前端
│   ├── embed.go                    # go:embed dist
│   ├── dist/                       # 构建产物(占位 index.html 已纳入)
│   ├── public/ src/                # 源码
└── data/                           # 运行时数据(sqlite/artifacts/logs,自动创建)
```

## 目录结构

```
aluka_ops/
├── cmd/server/main.go              # 入口
├── internal/
│   ├── config/                     # 配置(env)
│   ├── model/                      # GORM 实体(全表)
│   ├── repository/                 # 数据访问层
│   ├── service/                    # 业务逻辑层
│   ├── controller/                 # HTTP handler + 统一响应
│   ├── router/                     # 路由 + 中间件 + SPA 托管
│   └── pkg/db/                     # GORM 初始化 + 迁移 + seed
├── web/                            # 前端
│   ├── embed.go                    # go:embed dist
│   ├── dist/                       # 构建产物(占位 index.html 已纳入)
│   ├── public/ src/                # 源码
└── data/                           # 运行时数据(sqlite/artifacts/logs,自动创建)
```

## 快速开始

### 环境要求

- Go ≥ 1.25
- Node.js ≥ 18、npm ≥ 8

### 一、开发模式(前后端分离,热更新)

```bash
# 终端 1:后端(默认 :18080)
# 默认需要管理密码;本地开发如需无鉴权,显式加 -allow-no-auth
go run cmd/server/main.go -password dev-password

# 终端 2:前端(默认 :5173,/api 自动代理到 18080)
cd web
npm install
npm run dev
```

打开 http://localhost:5173 即可。修改前端代码自动热更新,修改后端代码重启 `go run` 即可。

> 开发期若想让后端直接读取磁盘上的最新 `web/dist`(避免每次改前端都重新 `go build`):
> ```bash
> ALUKA_WEB_DIR=./web/dist go run cmd/server/main.go -password dev-password
> ```
> 然后访问 http://localhost:18080,后端会优先从磁盘读取前端文件。

### 二、生产构建(单二进制)

```bash
# 1. 构建前端
cd web && npm install && npm run build && cd ..

# 2. 构建后端(自动嵌入 web/dist)
go build -o bin/aluka_ops.exe ./cmd/server

# 3. 运行(默认端口 18080)
./bin/aluka_ops.exe -password your-strong-password

# 指定端口(命令行优先于环境变量 ALUKA_PORT)
./bin/aluka_ops.exe -port 8080 -password your-strong-password
./bin/aluka_ops.exe -p 19090 -password your-strong-password
./bin/aluka_ops.exe -port 8080 -data-dir D:\aluka_data -password your-strong-password
./bin/aluka_ops.exe -h   # 查看全部命令行选项
```

打开 http://localhost:18080(或你指定的端口)。

生产环境必须设置 `ALUKA_PASSWORD` 或 `-password`。本地开发/受控测试如需无鉴权,需显式设置 `ALUKA_ALLOW_NO_AUTH=true` 或 `-allow-no-auth`。

### 命令行参数(优先于环境变量)
	
	| 参数 | 说明 |
	|------|------|
	| `-port` / `-p` | HTTP 监听端口(默认 `18080`) |
	| `-data-dir` | 数据目录(默认 `./data`) |
	| `-mode` | `standalone` / `agent` / `controller` |
	| `-password` | 管理密码(生产运行必须配置) |
| `-allow-no-auth` | 显式允许空管理密码(仅本地开发/受控测试) |
| `-allow-origin` | CORS 来源 |
	| `-controller-url` | Agent 模式:中心地址 |
	| `-agent-id` | Agent 标识 |
	| `-agent-token` | Agent/Controller 共享密钥 |
| `-allow-empty-agent-token` | 显式允许 Agent/Controller 空共享密钥(仅本地开发/受控测试) |
| `-advertise-url` | Agent 对外 API 根地址 |
	| `-h` / `-help` | 打印帮助 |
	
	### 配置项(环境变量)
	
	| 变量 | 默认 | 说明 |
	|------|------|------|
	| `ALUKA_PORT` | `18080` | HTTP 端口(可被 `-port` 覆盖) |
| `ALUKA_DATA_DIR` | `./data` | 数据目录(sqlite、制品、日志) |
| `ALUKA_MODE` | `standalone` | `standalone` / `agent` / `controller` |
| `ALUKA_WEB_DIR` | (空) | 指定磁盘前端目录,优先于内嵌(开发用) |
| `ALUKA_ALLOW_ORIGIN` | `*` | CORS 来源；`*` 返回通配来源且不启用 credentials，生产环境建议配置控制台的精确 Origin |
| `ALUKA_TRUSTED_PROXIES` | (空) | 可信反向代理 IP/CIDR；为空时忽略客户端 `X-Forwarded-For`/`X-Real-IP`，前置代理需清理客户端转发头 |
| `ALUKA_PASSWORD` | (空) | 管理密码;生产运行必须配置(仅空白字符视为空) |
| `ALUKA_ALLOW_NO_AUTH` | `false` | 显式允许空管理密码,仅用于本地开发/受控测试 |
| `ALUKA_TOKEN_TTL_HOURS` | `24` | Token 有效期(小时) |
| `ALUKA_AGENT_ID` | 主机名 | Agent 唯一标识 |
| `ALUKA_CONTROLLER_URL` | (空) | 中心 Controller 地址(启用心跳) |
| `ALUKA_AGENT_TOKEN` | (空) | Agent 共享密钥(上报与 /api/agent);`agent`/`controller` 模式生产运行必须配置,跨源浏览器请求需允许 `X-Agent-Token` |
| `ALUKA_ALLOW_EMPTY_AGENT_TOKEN` | `false` | 显式允许 Agent/Controller 空共享密钥,仅用于本地开发/受控测试 |
| `ALUKA_HEARTBEAT_SEC` | `15` | 心跳间隔秒 |
| `ALUKA_ADVERTISE_URL` | (空) | Agent 对外 API 根地址(供中心回连) |
| `ALUKA_OFFLINE_AFTER_SEC` | `45` | Controller 判定 Agent 离线的秒数 |

## API 速览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查(版本、模式、DB 状态,无需登录) |
| GET | `/api/auth/status` | 鉴权是否启用 / 是否已登录 |
| POST | `/api/auth/login` | 登录,返回 Token |
| POST | `/api/auth/logout` | 注销 Token |
| GET / POST | `/api/runtimes` | 运行环境 列表 / 新建 |
| GET / PUT / DELETE | `/api/runtimes/:id` | 查 / 改 / 删 |
| GET / POST | `/api/services` | 服务 列表 / 新建(含初始配置) |
| GET / PUT / DELETE | `/api/services/:id` | 详情 / 更新 / 删除(运行中禁删) |
| POST | `/api/services/:id/start` | **启动**进程 |
| POST | `/api/services/:id/stop` | **停止**进程(整树终止) |
| POST | `/api/services/:id/restart` | **重启**(stop → start) |
| GET | `/api/services/:id/status` | 实时状态探活(crashed 自动检测) |
| GET | `/api/services/:id/config` | 当前启动配置 |
| GET | `/api/services/:id/logs/stream` | **SSE 实时日志流**(meta/history/log 事件) |
| GET | `/api/services/:id/logs` | 日志历史尾部(JSON) |
| GET | `/api/services/:id/logs/file` | 日志文件下载 |
| GET / POST | `/api/services/:id/artifacts` | 制品 列表 / **上传**(multipart) |
| GET / DELETE | `/api/services/:id/artifacts/:aid` | 制品 详情 / 删除(当前版本禁删) |
| GET | `/api/services/:id/artifacts/:aid/download` | 制品原文件下载 |
| POST | `/api/services/:id/install?artifact_id=X` | **安装**:部署制品到 install_dir |
| POST | `/api/services/:id/uninstall` | **卸载**:停服+清理目录+重置版本 |
| POST | `/api/services/:id/upgrade?artifact_id=X` | **升级**:部署新版本(失败自动回滚) |
| POST | `/api/services/:id/rollback?artifact_id=X` | **回滚**:回到历史版本 |
| POST | `/api/services/:id/console` | **控制台**:向进程 stdin 写入(`{"input":"..."}`) |
| GET / PUT | `/api/services/:id/config` | 获取 / **更新**运行配置(运行中仅可改自动拉起相关) |
| GET | `/api/services/:id/operations` | 该服务的操作历史 |
| GET | `/api/operations` `/api/operations/:id` | 全局操作历史(含服务名) / 单条详情 |
| GET | `/api/dashboard/stats` | 仪表盘统计(服务状态/环境/异常/最近操作) |
| GET | `/api/audit-logs` `/api/audit-logs/:id` | **审计日志**列表/详情 |
| GET | `/api/runtimes/detect` | **本机 JDK 探测** |
| GET/POST | `/api/templates` | 服务模板列表 / 创建 |
| GET/PUT/DELETE | `/api/templates/:id` | 模板详情 / 更新 / 删除 |
| POST | `/api/templates/:id/apply` | **从模板创建服务**(变量渲染) |
| GET | `/api/system/host` | **本机资源**:CPU/内存/磁盘等 |
| GET/POST/… | `/api/files` | **文件管理**(data 内 CRUD/上传下载) |
| GET/POST | `/api/gateway/ports` | **站点(端口)** 列表/创建 |
| GET/PUT/DELETE | `/api/gateway/ports/:id` | 端口详情/更新/删除(`force=1` 级联) |
| GET/POST | `/api/gateway/apps` | **APP** 列表/创建(静态站) |
| GET/PUT/DELETE | `/api/gateway/apps/:id` | APP 详情/更新/删除 |
| GET/POST | `/api/gateway/proxies` | **端口反代**(`?port_id=` 过滤) |
| GET/PUT/DELETE | `/api/gateway/proxies/:id` | 反代详情/更新/删除 |
| GET/POST | `/api/gateway/scripts` | **路由脚本**(`?port_id=` 过滤) |
| GET/PUT/DELETE | `/api/gateway/scripts/:id` | 脚本详情/更新/删除 |
| GET | `/api/gateway/script-templates` | **内置脚本模板**列表 |
| GET | `/api/gateway/script-templates/:id` | 模板详情 |
| GET/POST | `/api/gateway/status` `/reload` | 运行时监听状态 / 重载 |

统一响应:`{ "code": 0, "message": "ok", "data": ... }`,`code=0` 为成功。

## 数据模型

`Node` · `Runtime` · `Service` · `ServiceConfig` · `Artifact` · `Template` · `Operation` · `AuditLog` · `Setting` · **`GatewayPort`** · **`App`** · **`PortProxyRule`** · **`PortRouteScript`** ·(兼容旧 `GatewayRule`)。

路由脚本 `script` 示例:

```json
[
  {"when":{"path_regex":"^/old/(.*)$"},"then":{"rewrite":"/new/$1"}},
  {"when":{"path_prefix":"/blocked"},"then":{"deny":403,"body":"forbidden"}},
  {"when":{"path_exact":"/go"},"then":{"redirect":"/home","status":302}}
]
```
