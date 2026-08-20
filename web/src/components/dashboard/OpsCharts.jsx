import { MiniBars, MiniHBar } from "./MiniBars";

function Donut({ segments, size = 96, thickness = 14 }) {
  const total = segments.reduce((s, v) => s + v.value, 0) || 1;
  let acc = 0;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border-1)" strokeWidth={thickness} />
        {segments.map((seg) => {
          const len = (seg.value / total) * circ;
          const gap = 2;
          const dash = `${Math.max(0, len - gap)} ${circ}`;
          const el = (
            <circle
              key={seg.label}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={-acc}
              strokeLinecap="round"
              transform={`rotate(-90 ${c} ${c})`}
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="min-w-0 space-y-1.5 text-xs">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seg.color }} />
            <span className="min-w-0 flex-1 truncate text-text2">{seg.label}</span>
            <span className="font-mono text-text1">{seg.value}</span>
          </div>
        ))}
        <div className="pt-1 text-[11px] text-text3">总计 {total}</div>
      </div>
    </div>
  );
}

function colorForOpType(type) {
  switch (type) {
    case "start":
      return "bg-success";
    case "stop":
      return "bg-danger";
    case "restart":
      return "bg-primary";
    case "upgrade":
      return "bg-warning";
    case "install":
      return "bg-teal-6";
    default:
      return "bg-text3";
  }
}

export function ServiceStatusDonut({ total, running, stopped, crashed, created }) {
  const segments = [
    { label: "运行中", value: running ?? 0, color: "var(--success-5)" },
    { label: "已停止", value: stopped ?? 0, color: "var(--text-3)" },
    { label: "异常", value: crashed ?? 0, color: "var(--danger-5)" },
    { label: "待启动", value: created ?? 0, color: "var(--warning-5)" },
  ].filter((s) => s.value > 0);
  if (segments.length === 0) {
    segments.push({ label: "暂无数据", value: 1, color: "var(--border-1)" });
  }
  return <Donut segments={segments} />;
}

export function OpsTypeBars({ operations }) {
  const counts = { start: 0, stop: 0, restart: 0, upgrade: 0, install: 0, other: 0 };
  for (const op of operations || []) {
    if (counts[op.type] !== undefined) counts[op.type]++;
    else counts.other++;
  }
  const data = [
    { label: "启动", value: counts.start },
    { label: "停止", value: counts.stop },
    { label: "重启", value: counts.restart },
    { label: "升级", value: counts.upgrade },
    { label: "安装", value: counts.install },
  ];
  return <MiniHBar data={data} colorFor={(d) => colorForOpType({ start: "start", 停止: "stop", 重启: "restart", 升级: "upgrade", 安装: "install" }[d.label] || "other")} />;
}

export function ResourceBars({ cpu, mem, disk }) {
  const data = [
    { label: "CPU", value: Math.round(cpu ?? 0) },
    { label: "内存", value: Math.round(mem ?? 0) },
    { label: "磁盘", value: Math.round(disk ?? 0) },
  ];
  return (
    <MiniBars
      data={data}
      max={100}
      barClassName="bg-primary"
      labelClassName="text-text3"
    />
  );
}

export function DiskTable({ disks }) {
  if (!disks?.length) return <div className="py-6 text-center text-xs text-text3">暂无磁盘数据</div>;
  return (
    <div className="space-y-2">
      {disks.slice(0, 4).map((d) => (
        <div key={d.path} className="flex items-center gap-3 text-xs">
          <span className="w-[88px] shrink-0 truncate font-mono text-text2" title={d.path}>
            {d.path}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg5">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round(d.used_pct ?? 0)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-text3">{Math.round(d.used_pct ?? 0)}%</span>
        </div>
      ))}
    </div>
  );
}
