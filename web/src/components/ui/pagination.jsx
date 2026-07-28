import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 表格底部分页栏。
 * @param {{ page:number, totalPages:number, total:number, from:number, to:number, onPageChange:(p:number)=>void, className?:string, pageSize?:number }} props
 */
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
          "flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground",
          className
        )}
      >
        <span>共 0 条</span>
      </div>
    );
  }

  const go = (p) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== page) onPageChange?.(next);
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground",
        className
      )}
    >
      <span>
        第 {from}–{to} 条，共 {total} 条
        {pageSize ? ` · 每页 ${pageSize}` : ""}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => go(1)}
          title="首页"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          title="上一页"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[4.5rem] text-center tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
          title="下一页"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => go(totalPages)}
          title="末页"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
