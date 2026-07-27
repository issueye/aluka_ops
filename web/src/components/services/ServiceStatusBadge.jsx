import { Badge } from "@/components/ui/badge";

// 状态 → 徽章样式映射。
// running=运行中(绿)、stopped=已停止(灰)、crashed=异常(红)、created=待启动(蓝)
const STATUS_META = {
  created:  { label: "待启动", variant: "default", dot: "bg-sky-400" },
  running:  { label: "运行中", variant: "success", dot: "bg-emerald-400 animate-pulse" },
  stopping: { label: "停止中", variant: "warning", dot: "bg-amber-400" },
  stopped:  { label: "已停止", variant: "secondary", dot: "bg-slate-400" },
  crashed:  { label: "异  常", variant: "danger", dot: "bg-red-500" },
  removed:  { label: "已移除", variant: "outline", dot: "bg-slate-500" },
};

// ServiceStatusBadge 服务运行状态徽章(含状态点)。
export function ServiceStatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: status || "未知",
    variant: "outline",
    dot: "bg-slate-400",
  };
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </Badge>
  );
}
