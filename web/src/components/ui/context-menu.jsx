import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * 轻量右键菜单（无额外依赖）。
 * @param {{
 *   open: boolean,
 *   x: number,
 *   y: number,
 *   onClose: () => void,
 *   children: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function ContextMenu({ open, x, y, onClose, children, className }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) {
      setPos({ left: x, top: y });
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setPos({ left, top });
  }, [open, x, y, children]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => onClose?.();
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    // 下一帧再监听，避免本次右键冒泡立刻关掉
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", close, true);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
      window.addEventListener("keydown", onKey);
      window.addEventListener("blur", close);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={cn(
        "fixed z-[100] min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        "animate-in fade-in-0 zoom-in-95",
        className
      )}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export function ContextMenuItem({
  children,
  icon: Icon,
  onClick,
  disabled,
  destructive,
  className,
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex w-full select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        destructive && "text-destructive focus:text-destructive hover:text-destructive",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.(e);
      }}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function ContextMenuSeparator({ className }) {
  return <div role="separator" className={cn("-mx-1 my-1 h-px bg-muted", className)} />;
}

export function ContextMenuLabel({ children, className }) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
