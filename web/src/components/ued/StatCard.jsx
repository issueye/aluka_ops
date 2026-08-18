import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ACCENT_ICON = {
  primary: "bg-primary-1 text-primary",
  success: "bg-success-2 text-success",
  warning: "bg-warning-2 text-warning",
  danger: "bg-danger-2 text-danger",
  default: "bg-bg4 text-text2",
};

/** 仪表盘与通用统计卡（源力设计：顶部圆形图标 + 大数值 + 标签 + 说明） */
export function StatCard(props) {
  // 兼容直接传 stat={...} 或单项 props
  const stat = props.stat || {};
  const label = props.label ?? props.title ?? stat.label ?? stat.title;
  const value = props.value ?? stat.value;
  const sub = props.sub ?? stat.sub;
  const Icon = props.icon ?? stat.icon;
  const to = props.to ?? stat.to;
  const accent = props.accent ?? props.color ?? stat.accent ?? stat.color ?? "default";
  const loading = props.loading ?? props.isLoading ?? false;
  const className = props.className;

  const cardContent = (
    <Card
      className={cn(
        "group h-full rounded-md border border-border1 bg-bg1 p-5 shadow-[0_1px_2px_0_rgba(12,13,14,0.05)] transition-all duration-200 hover:border-primary/40 hover:shadow-md",
        to && "cursor-pointer hover:-translate-y-0.5",
        className
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "mb-3 flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110",
            ACCENT_ICON[accent] || ACCENT_ICON.default
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <div className="text-2xl font-semibold leading-8 tabular-nums text-text1">
        {loading ? (
          <span className="inline-block animate-pulse text-text3">…</span>
        ) : (
          value ?? "—"
        )}
      </div>
      <div className="mt-1 text-[13px] font-medium leading-[22px] text-text2">{label}</div>
      {sub ? (
        <div className="mt-1 text-xs leading-[20px] text-text3">{sub}</div>
      ) : null}
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {cardContent}
      </Link>
    );
  }
  return cardContent;
}
