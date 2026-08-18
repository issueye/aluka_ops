import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 表格底部分页栏（源力设计：页码按钮 28x28，激活蓝底白字）。
 * @param {{ page:number, totalPages:number, total:number, from:number, to:number, onPageChange:(p:number)=>void, className?:string, pageSize?:number }} props
 */
function pageWindow(page, totalPages) {
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}

export function PaginationBar({
  page,
  totalPages,
  total,
  from,
  to,
  onPageChange,
  className,
  pageSize,
}) {
  if (total <= 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-t border-border1 px-4 py-3 text-sm text-text3",
          className
        )}
      >
        <span>共 0 项</span>
      </div>
    );
  }

  const go = (p) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== page) onPageChange?.(next);
  };

  const pages = pageWindow(page, totalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-border1 px-4 py-3 text-sm text-text3",
        className
      )}
    >
      <span>
        共 {total} 项，当前显示第 {from}–{to} 项
        {pageSize ? ` · 每页 ${pageSize}` : ""}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-sm border border-border2 bg-bg1 text-text2 transition-colors",
            page <= 1
              ? "cursor-not-allowed text-text4"
              : "hover:border-primary-4 hover:text-primary"
          )}
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-sm border text-sm transition-colors",
              p === page
                ? "border-primary bg-primary font-medium text-primary-foreground"
                : "border-border2 bg-bg1 text-text1 hover:border-primary-4 hover:text-primary"
            )}
            onClick={() => go(p)}
            aria-label={`第 ${p} 页`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-sm border border-border2 bg-bg1 text-text2 transition-colors",
            page >= totalPages
              ? "cursor-not-allowed text-text4"
              : "hover:border-primary-4 hover:text-primary"
          )}
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}