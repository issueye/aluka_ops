import { StatusBadge } from "@/components/ued";

const STATUS_META = {
  created: { label: "待启动", tone: "default", pulse: false },
  running: { label: "运行中", tone: "success", pulse: true },
  stopping: { label: "停止中", tone: "warning", pulse: false },
  stopped: { label: "已停止", tone: "secondary", pulse: false },
  crashed: { label: "异常", tone: "danger", pulse: false },
  removed: { label: "已移除", tone: "outline", pulse: false },
};

export function ServiceStatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: status || "未知",
    tone: "outline",
    pulse: false,
  };
  return (
    <StatusBadge tone={meta.tone} label={meta.label} pulse={meta.pulse} />
  );
}
