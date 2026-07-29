import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * 轻量右键菜单（无额外依赖）。
 * 外部关闭必须忽略菜单内部的 pointerdown，否则菜单项 click 会因卸载而失效。
 */
export function ContextMenu({ open, x, y, onClose, children, className }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
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
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return undefined;

    const close = () => onCloseRef.current?.();

    const onPointerDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    const onScroll = (e) => {
      if (ref.current?.contains(e.target)) return;
      close();
    };

    // 延后绑定，避免打开菜单的那次右键立刻触发关闭
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", close);
      window.addEventListener("keydown", onKey);
      window.addEventListener("blur", close);
    }, 0);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={cn(
        "fixed z-[200] min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        className
      )}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export function ContextMenuItem({
  children,
  icon: Icon,
  onSelect,
  onClick,
  disabled,
  destructive,
  className,
}) {
  const fired = useRef(false);

  const run = (e) => {
    if (disabled) return;
    // 同一手势可能同时触发 pointerup + click，只执行一次
    if (fired.current) return;
    fired.current = true;
    e.preventDefault();
    e.stopPropagation();
    const fn = onSelect || onClick;
    try {
      fn?.(e);
    } finally {
      // 若菜单未卸载（禁用项等），短暂后允许再次点
      window.setTimeout(() => {
        fired.current = false;
      }, 300);
    }
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex w-full select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        destructive &&
          "text-destructive hover:text-destructive focus:text-destructive",
        className
      )}
      onClick={run}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") run(e);
      }}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function ContextMenuSeparator({ className }) {
  return (
    <div role="separator" className={cn("-mx-1 my-1 h-px bg-muted", className)} />
  );
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
