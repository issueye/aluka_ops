# Aluka Ops · UED 规范

> 版本：1.0 · 风格：精修 shadcn 运维控制台（青蓝主色 + slate）  
> 适用范围：`web/src` 全部前端 UI

---

## 1. 设计原则

1. **信息密度中高**：运维场景优先可读与效率，避免大留白与装饰插画。
2. **状态语义优先**：running / crashed / warning 等用语义色与状态点表达，不依赖纯文字。
3. **单一视口滚动**：`html/body/#root` 不滚动，仅主内容区（或侧栏）滚动。
4. **自定义弹出层**：Dialog / Select / Dropdown / Tooltip 一律 Radix + Portal + 主题样式，**禁止**依赖浏览器原生外观。
5. **组件分层**：`ui`（原子）→ `ued`（页面模式）→ `services|runtimes|layout`（域）→ `pages`。

---

## 2. 色彩 Token

CSS 变量定义于 `src/index.css`，Tailwind 映射于 `tailwind.config.js`。

| Token | 用途 |
|-------|------|
| `primary` | 品牌/主操作（青蓝） |
| `success` / `success-muted` | 成功、运行中、在线 |
| `warning` / `warning-muted` | 警告、停止中、阈值告警 |
| `danger` / `danger-muted` | 危险、异常、失败（与 destructive 对齐） |
| `muted` | 次要文字/底 |
| `log` / `log-foreground` | 终端/日志查看器底色与文字（亮色浅底深绿、暗色深底亮绿，保证两主题对比度）。xterm 终端须经 `lib/terminalTheme.js`（从 token 解析并跟随主题热更新），禁止页面内硬编码 hex |
| `border` / `input` / `ring` | 边框、表单、焦点环 |

### 禁止

- 页面内散落 `text-red-400`、`bg-emerald-500`、`bg-red-600` 等硬编码色（Badge 内部与进度条阈值色除外，须集中封装）。
- 表单错误色用 `text-destructive` 或 `text-danger`，不用 `text-red-400`。
- 删除确认按钮用 `variant="destructive"` 或 `ConfirmDialog`，不用 `bg-red-600`。

---

## 3. 字体与层级

| 层级 | 类名约定 | 场景 |
|------|----------|------|
| 页面标题 | Topbar `text-base font-semibold` | 路由标题 |
| 卡片标题 | `CardTitle` / `text-sm`～`text-base` | 区块 |
| 正文 | `text-sm` | 默认 |
| 辅助 | `text-xs text-muted-foreground` | 描述、时间 |
| 等宽 | `font-mono text-xs` / `CodeText` | code、path、PID、端口、日志 |

---

## 4. 间距与密度

| 区域 | 约定 |
|------|------|
| 主内容 padding | `p-6`（AppLayout） |
| 页面纵向间距 | `PageShell` → `space-y-4`（仪表盘可用 `space-y-6`） |
| 表单字段 | `FormField` → `space-y-1.5` |
| 表格单元格 | `p-3`，表头 `h-10` |
| 列表 Card 表体 | `CardContent p-0` 贴边表格 |
| 控件高度 | 默认 `h-9`，紧凑 `h-8`（`size="sm"`） |

圆角：`--radius: 0.5rem`；Card 为 `rounded-xl`。

---

## 5. 组件分层

### 5.1 原子层 `components/ui/`

Button、Badge、Card、Input、Label、Textarea、Select、Switch、Table、Tabs、Dialog、AlertDialog、Pagination、**DropdownMenu**、**Tooltip**、**Skeleton**、Progress（可选）。

### 5.2 复合层 `components/ued/`

| 组件 | 职责 |
|------|------|
| `PageShell` | 页面根间距 |
| `ListPageHeader` | 列表 Card 头：图标+标题+描述+操作 |
| `DetailHeader` | 详情顶栏：返回+标题+徽章+操作 |
| `DataTableCard` | Card + 表体 + 分页壳 |
| `TableStateRow` | 加载/空行 |
| `EmptyState` | 空状态 |
| `InlineAlert` | error/warning/info 横幅 |
| `FormField` / `FormGrid` | 表单字段 |
| `MetaField` / `KeyValueGrid` | 只读键值 |
| `StatusDot` / `StatusBadge` | 状态点与徽章 |
| `TypeChip` | 类型标签 |
| `RowActions` | 行操作组 |
| `RefreshButton` | 刷新按钮 |
| `ConfirmDialog` | 危险确认 |
| `FileDropzone` | 文件投放区 |
| `CodeText` / `PathText` | 等宽文本 |
| `StatCard` / `UsageBar` | 统计卡与使用率条 |
| `IconTooltip` | 图标按钮 + Tooltip 快捷封装 |

### 5.3 域组件

`ServiceStatusBadge`、`ServiceActions` 等**组合** ued/ui，不重复造色与间距。

---

## 6. 交互规范

| 场景 | 规范 |
|------|------|
| 危险操作 | `ConfirmDialog`（二次确认），禁止 `window.confirm` |
| 反馈 | `sonner` toast（success/error） |
| 加载 | 表格用 `TableStateRow`；区块可用 `Skeleton` 或「加载中…」 |
| 空状态 | `EmptyState` 或表格 empty 文案 |
| 错误 | `InlineAlert variant="error"` |
| 图标按钮提示 | `Tooltip` / `IconTooltip`，禁止仅靠原生 `title` 作为唯一提示 |
| 下拉选择 | 仅用 `@/components/ui/select`，禁止可见原生 `<select>` |
| 行操作过多 | `DropdownMenu` 收纳为「···」 |

---

## 7. 禁止项（门禁）

- [ ] 业务代码出现可见原生 `<select>` / `<option>`（隐藏 file input 除外）
- [ ] `window.confirm` / `window.alert` / `window.prompt`
- [ ] 删除按钮 `bg-red-600` 等硬编码危险色
- [ ] 新代码仅用 `title=` 而无 `aria-label` / Tooltip
- [ ] 在 page 内复制一套 FormField / ErrorBanner 样式而不用 ued

---

## 8. 导入约定

```js
// 原子
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, ... } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// 复合
import { PageShell, ListPageHeader, ConfirmDialog, FormField, StatusBadge } from "@/components/ued";
```

根布局须包裹 `TooltipProvider`（见 `AppLayout`）。

---

## 9. 无障碍最低要求

- 图标按钮提供 `aria-label` 或可见文案
- Dialog / AlertDialog 使用 Title + Description
- 焦点环使用 `ring-ring`，不关闭 outline

---

## 10. 变更流程

新增 UI 模式时：优先扩展 `ued/` → 再在 page 使用；避免在单个 page 发明第三套间距/颜色。
