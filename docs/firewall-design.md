# 防火墙功能设计（面板自防护 + 网关访问控制增强）

> 状态：设计稿（仅文档，未实施）
> 范围：**面板自防护** + **网关访问控制增强**；不含主机系统防火墙（Windows netsh / Linux iptables 等，见 §7 未来扩展）
> 关联里程碑：F1 → F2 → F3

---

## 1. 背景与现状盘点

Aluka Ops 同时提供两套对外 HTTP 入口，它们的安全边界现状不同：

| 入口 | 现状 | 已有防护 | 空白点 |
|------|------|----------|--------|
| **面板自身**（Gin，默认 `:18080`，`/api/*` + SPA） | 单管理员密码 + Bearer Token（`internal/middleware/auth.go`） | Token 鉴权（`AuthRequiredFn`）、写操作审计（`AuditWrite`）、可选 CORS 限制 | ①无 IP 访问控制；②`POST /api/auth/login` 可无限尝试密码（无防爆破） |
| **网关端口**（`internal/pkg/gateway`，每端口独立 `net/http.Server`） | 站点级 IP 黑白名单已成品（`iplist.go`，`manager.go serve()` :293 生效） | 站点级 IP 名单、路由脚本 `then.deny`、`then.redirect` | ①无限流（单 IP 可打爆反代/静态）；②黑白名单只到站点级，不能按反代规则细分；③被拦截来源不可见（无统计） |

本次设计补上全部空白点。**复用优先**：IP 解析/判定一律复用 `gateway.NewIPFilter` / `gateway.ClientIP`（含可信代理链 XFF 解析，默认仅信 TCP 对端），不另造轮子。

---

## 2. 总体设计

### 2.1 两大模块

```
┌─ 模块一：网关访问控制增强（Gateway ACL+）──────────────────────┐
│  站点级限流（每 IP 令牌桶） → 429 + Retry-After                │
│  反代规则级 IP 名单（复用 NewIPFilter） → 403                  │
│  拦截统计（端口×IP×原因）+ 一键拉黑                            │
└───────────────────────────────────────────────────────────────┘
┌─ 模块二：面板自防护（Panel Guard）────────────────────────────┐
│  面板 IP 黑白名单（中间件 ipguard.go）                        │
│  登录防爆破：失败计数 → 封禁全部 API（fail2ban 风格）          │
│  封禁查询/解封接口 + Settings 页「面板防护」小节               │
└───────────────────────────────────────────────────────────────┘
```

两个模块**状态全部在内存**（网关限流桶、拦截统计、登录失败计数、封禁表），不新增业务表，避免把"抗压防护"做成 DB 依赖；重启即清零，作为安全取舍写进文档（§5）。

### 2.2 网关请求处理链路（改造后）

`manager.go serve()`（现 :284）改造后的完整顺序：

```
① 站点级 IP 名单   → 403 (现有 :293, 计入拦截统计: acl_site)
② 站点级限流        → 429 + Retry-After (新增, 计入统计: rate_limit)
③ 路由脚本 RunScripts → deny → 403 (计入统计: script_deny)
                       → redirect / proxy / static (不变)
④ 最长前缀匹配规则 → 命中反代规则时:
   ④a 规则级 IP 名单 → 403 (新增, 计入统计: acl_rule)
   ④b 转发 (不变)
```

客户端 IP 在 ① 处**只解析一次**（`cip := ClientIP(r, trustedProxies)`），①~④ 全程复用同一 `cip`——限流与统计按同一真实来源计，杜绝"名单用 XFF、限流用对端"的口径分裂。

### 2.3 面板请求处理链路（改造后）

`router.go` 中间件顺序（现 :149-153）：

```
api := r.Group("/api")
api.Use(AuthRequiredFn)  // :151 现有——先判定 operator=agent
api.Use(ipGuard)         // :153 新增——机器流量与豁免路径放行, 其余按封禁/黑白名单判定
api.Use(AuditWrite)      // :155 现有
```

`ipGuard` 放在 Auth 之后：可直接读取 `operator=agent`（Agent Token 认证的 Controller↔Agent 机器流量**整体放行**，避免破坏集群链路），又因 Auth 对 `/api/auth/login` 等未鉴权路径直接 `c.Next()` 不设 operator，登录入口仍会被 IP 防护覆盖——正是需要防护的面。

---

## 3. 模块一：网关访问控制增强（Gateway ACL+）

### 3.1 站点级限流（每 IP 令牌桶）

**模型变更**（`internal/model/app.go` → `GatewayPort`）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `RateLimitPerMin` | `int` | `0` | 每客户端 IP 每分钟请求数上限；`0` = 不限流 |
| `RateLimitBurst` | `int` | `0` | 令牌桶容量（突发容忍）；`0` = 取 `RateLimitPerMin` |

> 全部带默认值 → GORM AutoMigrate 对 SQLite 平滑加列，`internal/pkg/db/db.go` 无需改动。

**运行时**（新文件 `internal/pkg/gateway/ratelimit.go`）：

- 每 `(port, ip)` 一个令牌桶：`capacity = burst`，`refill = ratePerMin/60`（令牌/秒），按 `时间差×refill` 补充、单次上限 `capacity`。
- 惰性创建 + **空闲淘汰**：访问时发现闲置超 15 分钟即删除；每端口桶数上限 50,000，超限淘汰最久未用（防内存膨胀，§5.2）。
- 线程安全（`sync.Mutex` + map）。
- 超限响应：`429`，`Retry-After: <剩余等待秒>`，body 纯文本 `rate limit exceeded`；可选 `X-RateLimit-Limit/Remaining` 头（前端调试用）。

**校验与热重载**：

- `app_service.go` CreatePort（:132 NewIPFilter 校验旁）与 UpdatePort（:184）增加参数校验：`rate_per_min < 0` 拒绝；`burst < 0` 拒绝；`burst==0` 归一为 `rate_per_min`。
- `compilePortConfigs`（:749）把 `RateLimitPerMin/Burst` 编译进 `gateway.PortConfig` → `portServer`；`ApplyPorts` 热替换快照时**重建限流器（计数清零）**——配置变更清零视为可接受行为，文档注明。

### 3.2 反代规则级 IP 名单

**模型变更**（`PortProxyRule`）：新增

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `IPWhitelist` | `string`(text) | `""` | 与站点级同格式（换行/逗号/分号分隔，支持 CIDR、`#` 注释） |
| `IPBlacklist` | `string`(text) | `""` | 同上，黑名单优先拒绝 |

**执行链**：只在④a——前缀匹配**选中某条反代规则后、转发前**判定（静态 App 不适用，保持现状）。未被任何规则命中的请求仍只受站点级名单约束。

**实现**：`compilePortConfigs` 为每条 enabled 规则编译独立 `*VisualFilter`（复用 `NewIPFilter`，错误同 Create/Update 预校验逻辑，参考 :821 的编译写法）；`serve()` 命中规则分支时判定，不通过 → 403 + 计数。

### 3.3 拦截统计 + 一键拉黑

**运行时**（新文件 `internal/pkg/gateway/metrics.go`）：

- `BlockStats`：`map[port]map[ip]*BlockEntry`，`BlockEntry{Count403, Count429, LastReason, FirstSeen, LastSeen}`；`LastReason` ∈ `acl_site / acl_rule / rate_limit / script_deny`。
- 挂在 `Manager` 上：**独立于配置快照，`ApplyPorts` 不清理**；端口关闭时清除该端口条目。
- 容量与过期：单条目标上限 10,000 IP/端口，超限淘汰最久未更新；访问时顺带清理 24h 无更新的条目（§5.2）。
- 计数钩子：① 站点名单 403、④a 规则名单 403、② 限流 429、③ 脚本 `deny`（`serve()` 中 `act.Kind=="deny"` 分支）四处各加一行 `m.recordCount(port, cip, reason)`。

**API**（挂 `api.Group("/gateway/stats")`，`GatewayController` 或新增 `StatsController`）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/gateway/stats/blocks?port_id=X` | 拦截统计列表：`{items:[{ip, count403, count429, last_reason, first_seen, last_seen}]}`；不带 `port_id` 返回全端口聚合 |
| POST | `/api/gateway/stats/blocks/reset` | body `{port_id?}` 清零（全部或单端口）；写操作自动进审计 |

**前端**（`SiteDetail.jsx`）：

- 站点详情新增「拦截统计」卡片：按需拉取（非轮询），表格列 = IP / 403 次数 / 429 次数 / 原因 / 首次 / 最近；行内「拉黑」按钮 → 二次确认 → 把该 IP 追加写入站点现有 `IPBlacklist` 字段（走既有 `updatePort`，热重载即刻生效）；行内「解封统计」= 单独 reset 该 IP（可选，F2 内）。

### 3.4 网关模块改动文件清单

| 文件 | 改动 |
|------|------|
| `internal/model/app.go` | `GatewayPort` + 2 字段；`PortProxyRule` + 2 字段 |
| `internal/pkg/gateway/ratelimit.go` | **新建**：令牌桶限流器 |
| `internal/pkg/gateway/metrics.go` | **新建**：拦截计数 |
| `internal/pkg/gateway/manager.go` | `serve()` 插入 ②④a 与计数钩子；`cip` 提前计算；`PortConfig` + 限流字段 |
| `internal/service/app_service.go` | Create/UpdatePort 校验；`compilePortConfigs` 编译限流与规则级名单；新增 `BlockStats/ResetBlocks` 方法 |
| `internal/controller/app_controller.go` | 新增 stats 两个 handler |
| `internal/router/router.go` | 注册 `/api/gateway/stats/*` |
| `web/src/lib/api.js` | `gatewayApi` + `listBlocks/resetBlocks` |
| `web/src/pages/Sites.jsx` | 表单加限流字段；列表加限流徽章 |
| `web/src/pages/SiteDetail.jsx` | 反代表单加 IP 名单字段；新增拦截统计卡片 |

---

## 4. 模块二：面板自防护（Panel Guard）

### 4.1 面板 IP 访问控制

**运行时**（新文件 `internal/pkg/guard/PanelConfig + internal/middleware/ipguard.go`）：

- `guard` 包持有一份**面板防护配置快照** `PanelConfig{Whitelist, Blacklist string; MaxFails int; Window, Ban time.Duration}`（读写锁），作内存配置源，供中间件与 `AuthController` 热读取。
- `ipguard` gin 中间件判定流程：

```
if operator == "agent"                    → 放行（机器流量，已由 X-Agent-Token 认证）
if path ∈ {/api/health, /api/agents/heartbeat, /api/tunnel/ws} → 放行（与 auth.go :29-31 豁免一致）
if guard.IsBanned(ip)                     → 403 "IP 已被封禁"
ip = ClientIP(r, trustedProxies)          ← 复用 gateway.ClientIP（同一可信代理配置，默认仅 TCP 对端）
黑名单命中 → 403；白名单非空且未命中 → 403
其余 → 放行
```

- 客户端 IP 解析与网关共用同一套 `ALUKA_TRUSTED_PROXIES`（`config.go:37`）——前置代理部署时行为一致，未配置时 XFF 一律不可信（§5.1）。

**配置来源与优先级**（Setting > 环境变量 > 默认值，参照 `cluster_service.go` 的 Setting 模式）：

| Setting 键 | 环境变量（启动兜底） | 默认 |
|-----------|----------------------|------|
| `panel.ip_whitelist` | `ALUKA_PANEL_IP_WHITELIST` | 空（不限） |
| `panel.ip_blacklist` | `ALUKA_PANEL_IP_BLACKLIST` | 空 |
| `panel.login_max_fails` | `ALUKA_LOGIN_MAX_FAILS` | `5` |
| `panel.login_window_sec` | `ALUKA_LOGIN_WINDOW_SEC` | `600`（10 分钟） |
| `panel.login_ban_sec` | `ALUKA_LOGIN_BAN_SEC` | `900`（15 分钟） |

> env 在启动时读入 `PanelConfig` 作兜底值；Settings 页保存时写 DB 并同步内存快照，**立即生效**。env 仅作"防锁死逃生通道"（误设白名单后重启进程可绕过）。

**Settings API**（新增轻量 `internal/controller/settings_controller.go` + `service/settings_service.go`，复用 `repository.SettingRepository`）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 返回面板防护相关键值（不暴露全部 Setting） |
| PUT | `/api/settings/panel` | 更新面板防护参数；**防自锁校验**：若本次写入的白名单非空，用当前请求的 `ClientIP` 校验其必须命中新白名单，未命中则拒绝保存（`400`，提示"新白名单未包含当前访问 IP"） |

> `/api/settings` 不在 `CONTROLLER_API_PREFIXES`（api.js:105）内 → 随 `scope()` 流转：选择远程 Agent 时可管理该节点面板防护（与网关统计同理），本地作用域即管理本机——两种语义都正确。

### 4.2 登录防爆破（fail2ban 风格）

**运行时**（新文件 `internal/pkg/guard/guard.go`）：

- 状态机（内存 map，读写锁）：

```
per-ip failState{count, windowStart, banUntil}
  Login 失败:  RecordFailure(ip)
    窗口滑动: 现在 - windowStart > Window → count=1, windowStart=now
    否则 count++
    count >= MaxFails → banUntil = now + Ban, count 清零
  Login 成功:  RecordSuccess(ip) → 清除该 IP 全部状态
  IsBanned(ip):banUntil > now（顺带清理过期项）
```

- 参数从 `PanelConfig` 热读；因封禁表与计数都在内存，**重启清零**（取舍说明见 §5.3）。
- 封禁对象是**全部 `/api/*`**（不止 login）：`ipguard` 中间件对封禁 IP 直接 403——暴力破解脚本在封禁窗口内连健康探测都做不了，这是比"只限登录接口"更强的 fail2ban 语义。

**挂钩**（`internal/controller/auth_controller.go` Login，:46-70）：

```
ip = ClientIP(c.Request, trustedProxies)
if guard.IsBanned(ip)                         → 403 "IP 已被临时封禁" + data.retry_after
store.Login(body.Password)
 失败: guard.RecordFailure(ip)
       若本次触发封禁 → 429 {message:"尝试次数过多，已临时封禁", retry_after}
       否则           → 401 密码错误（保留现 40101）
 成功: guard.RecordSuccess(ip) → 签发 Token（不变）
```

**管理接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/guard` | 返回 `{bans:[{ip, ban_until, retry_after}], failures:[{ip, count, window_start}]}` |
| DELETE | `/api/auth/guard/bans/:ip` | 人工解封（写操作自动进审计，`AuditWrite` 按路径归类） |

> `/api/auth/*` 在 `CONTROLLER_API_PREFIXES` 内 → 始终走控制面（本地节点），多节点场景下封禁管理不随网关作用域漂移（§5.4）。

### 4.3 面板防护模块改动文件清单

| 文件 | 改动 |
|------|------|
| `internal/pkg/guard/guard.go` | **新建**：封禁/失败状态机 + `PanelConfig` |
| `internal/middleware/ipguard.go` | **新建**：IP/封禁判定中间件 |
| `internal/controller/settings_controller.go` | **新建**：`GET /api/settings`、`PUT /api/settings/panel`（含防自锁校验） |
| `internal/service/settings_service.go` | **新建**：Setting 读写 + 内存快照同步 |
| `internal/controller/auth_controller.go` | Login 挂钩失败计数/封禁/PASS |
| `internal/config/config.go` | +5 个 env 配置项与命令行帮助行 |
| `internal/router/router.go` | 组装 `PanelConfig`/`Guard`；挂载 `ipguard`；注册 `/api/settings` |
| `web/src/lib/api.js` | `guardApi`（list/unban）、`settingsApi` |
| `web/src/pages/Settings.jsx` | 「安全设置」分区新增「面板防护」小节：IP 名单两个 textarea、防爆破参数、当前封禁列表 + 解封按钮 |

---

## 5. 安全考量

**5.1 XFF 伪造**：网关与面板共用 `gateway.ClientIP` + `ALUKA_TRUSTED_PROXIES`。未配置可信代理时只认 TCP 对端，客户端伪造 `X-Forwarded-For` 无效；配置了可信代理时，仅可信链上首个非可信跳记为用户 IP（现逻辑 :100-116）。**统计与限流计入的 IP 必须同一来源**（§2.2 的 cip 单次解析）。

**5.2 内存上限**：三类驻留集合全部有界——限流桶（50,000/端口 + 15min 闲置淘汰）、拦截统计（10,000 IP/端口 + 24h 过期清理）、封禁表（1,000 条 + 过期清理）。全部懒清理，不引入后台 goroutine。

**5.3 封禁/统计重启清零**：面板 Guard 与网关状态均为内存态。面板封禁重启即失效属**有意取舍**——服务器重启通常伴随访问源变化，且误封重启可自愈；如需持久化可作后续增强（落 `Setting` 或新表，本节留待 F3 验收后评估）。拦截统计同理，reload 不清、重启清。

**5.4 集群/多节点语义**：`operator=agent` 的请求整体跳过 IP 防护（机器间已由 `X-Agent-Token` 认证）；若用户配置白名单过窄导致 Controller 无法回连 Agent，这是**配置意图**而非缺陷——文档与 UI hint 需明示"白名单会作用于 Web 访问，机器流量不受影响"。面板防护与登录封禁属**每节点**控制面（`/api/auth/*` 不随网关作用域漂移）。

**5.5 防自锁**：白名单保存前校验当前会话 IP 命中新值（§4.1）；即使手滑锁死，env 原生变量与重启仍可逃生。

**5.6 审计与留痕**：全部新增写操作（reset、解封、settings 更新）由 `AuditWrite` 自动落库。`classifyAPI`（audit.go:207）对 `POST /api/gateway/stats/blocks/reset` 会记成 `action=blocks`、`DELETE /api/auth/guard/bans/:ip` 记成 `action=bans`——语义可辨识但非最精确，可在实施时给 `classifyAPI` 加两个特殊分支（低成本，可选）。

**5.7 限流参数合理默认**：`RateLimitPerMin` 默认 `0`（不限）保持零配置可用；开启限流的站点建议 UI 展示"每 IP 每分钟 N 次"字面提示，避免业务误伤。

---

## 6. 里程碑与验收标准

### F1 网关限流 + 规则级 IP 名单

- 交付：§3.1 + §3.2 全部后端（模型/校验/热重载/429/403）+ 前端字段与徽章。
- 验收：站点配置 `rate_limit_per_min=60` 后，同 IP 高压请求首个超速包返回 `429` 且带 `Retry-After`；不同 IP 互不影响；反代规则配置黑名单 IP 后该 IP 403、其余正常；`POST /api/gateway/reload` 与规则编辑后立即生效。

### F2 拦截统计 + 一键拉黑

- 交付：§3.3 全部（metrics + 2 接口 + 站点详情卡片 + 一键拉黑）。
- 验收：人为制造 403（名单/脚本）与 429 后，`GET /api/gateway/stats/blocks` 计数与原因正确；一键拉黑后该 IP 立即 403 且黑名单字段追加成功；reset 后清零。

### F3 面板自防护

- 交付：§4 全部（ipguard + guard + settings API + Settings 页小节 + env 配置）。
- 验收：配置白名单后其余 IP 访问任意 `/api/*` 为 403、命中 IP 正常；连续错密 5 次（窗口内）触发全站封禁，`GET /api/auth/guard` 可见，解封接口恢复并可正常登录；保存不含当前 IP 的白名单被拒绝；Agent Token 请求与 `/api/health` 不受 IP 名单影响。

**通用**：`go build ./...`、`go vet ./...`、`go test ./...` 全绿；前端 `npm run build` 通过。

---

## 7. 范围外与未来扩展（简述）

- **主机系统防火墙管理**：Windows `netsh advfirewall` / PowerShell、Linux `ufw`/`firewalld`/`iptables` 的端口放行与规则 CRUD，与托管服务/站点的端口联动一键放行。本次未纳入，属独立大模块——需新建 `internal/pkg/firewall/`（照 `internal/pkg/process/` 的 build-tag 平台分文件模式），涉及提权（管理员/root）检测与降级提示，建议作为下一里程碑立项时另行设计。
- **网关 WAF 语义**：`then` 动作扩展（如 `then.limit`、按 header/UA 规则）、地理/ASN 拦截。
- **封禁持久化**：`guard` 落库 + 启动恢复，与审计查询打通。
- **限流告警**：拦截统计达阈值时写入操作留痕/审计，供 Dashboard 展示。

---

## 8. 测试计划

- **单测**（照 `gateway/iplist_test.go` 风格，`go test -race`）：
  - `ratelimit_test.go`：令牌补充速率、burst 上限、闲置淘汰、超限判定边界、并发安全。
  - `metrics_test.go`：四类原因计数、容量淘汰、reset 语义、端口维度隔离。
  - `guard_test.go`：窗口滑动、触发封禁、封禁过期、成功清零、unban、并发。
  - `ipguard_test.go`（httptest）：白名单/黑名单/封禁/agent token 放行/豁免路径/可信代理下 XFF 解析。
  - `settings_service_test.go`：防自锁校验（新白名单不含当前 IP → 拒绝）。
- **回归**：既有的 `iplist_test.go`、网关脚本体（script）行为不被 serve() 改动破坏。

---

## 附：一句话总结

在既有"站点级 IP 黑白名单"成品之上：网关侧补齐**限流（每 IP 令牌桶 429）**、**规则级 IP 名单**与**拦截统计/一键拉黑**；面板侧补齐**IP 黑/白名单中间件**与**登录防爆破（失败封禁全站）**，全部内存态、零新增业务表、复用现有热重载/审计/Setting 机制。