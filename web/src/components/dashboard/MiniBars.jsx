/** 轻量柱状/条形图（无外部依赖，纯 SVG+Tailwind） */
export function MiniBars({ data, max, barClassName = "bg-primary", labelClassName = "text-text3" }) {
  const peak = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5">
      {data.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-[64px] w-full items-end justify-center">
            <div
              className={`w-full max-w-[28px] rounded-sm transition-all duration-300 ${barClassName}`}
              style={{ height: `${Math.max(4, Math.round((item.value / peak) * 64))}px` }}
              title={`${item.label}: ${item.value}`}
              aria-label={`${item.label} ${item.value}`}
            />
          </div>
          <span className={`truncate text-[11px] ${labelClassName}`}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MiniHBar({ data, max, colorFor }) {
  const peak = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className="w-[64px] shrink-0 truncate text-text3">{item.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${colorFor ? colorFor(item) : "bg-primary"}`}
              style={{ width: `${Math.round((item.value / peak) * 100)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-text2">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
