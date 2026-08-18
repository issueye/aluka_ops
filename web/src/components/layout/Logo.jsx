import { cn } from "@/lib/utils";

/** Aluka Ops 图标标（源力蓝底 + 白 A + 青状态点） */
export function LogoMark({ className }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="#1664FF" />
      <path
        d="M8.5 23.5 L15.2 8.2"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M23.5 23.5 L16.8 8.2"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M11.2 17.2 H20.8"
        stroke="#37E2E2"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="7.2" r="2.35" fill="#37E2E2" />
    </svg>
  );
}

/**
 * Aluka Ops Logo
 * - 默认：图标 + 字标
 * - markOnly：仅图标（侧栏产品区等）
 */
export function Logo({ className, markOnly = false, markClassName }) {
  if (markOnly) {
    return <LogoMark className={cn("h-6 w-6", className, markClassName)} />;
  }

  return (
    <span
      className={cn("inline-flex items-center gap-2 text-text1", className)}
      aria-label="Aluka Ops"
    >
      <LogoMark className={cn("h-6 w-6", markClassName)} />
      <span className="truncate text-[15px] font-semibold leading-none tracking-tight">
        Aluka Ops
      </span>
    </span>
  );
}
