import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const baseClass =
  "inline-flex items-center gap-0.5 whitespace-nowrap rounded-sm px-2 py-1 text-xs leading-4 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const toneClass = (tone) =>
  tone === "danger"
    ? "text-danger hover:bg-danger-2"
    : "text-primary hover:bg-primary-1";

/**
 * 表格行文字操作按钮（源力设计：12px 主色文字 + hover 浅蓝底）。
 * @param {"primary"|"danger"} tone
 */
export function TextActionButton({ tone = "primary", className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(baseClass, toneClass(tone), className)}
      {...props}
    >
      {children}
    </button>
  );
}

/** 表格行文字操作链接：to=站内路由，href=外链 */
export function TextActionLink({ tone = "primary", className, children, to, ...props }) {
  const classes = cn(baseClass, toneClass(tone), className);
  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a className={classes} {...props}>
      {children}
    </a>
  );
}
