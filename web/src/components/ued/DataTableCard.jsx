import { Card, CardContent } from "@/components/ui/card";
import { PaginationBar } from "@/components/ui/pagination";
import { ListPageHeader } from "./ListPageHeader";
import { cn } from "@/lib/utils";

/**
 * 列表页标准壳：Header + flush 内容 + 可选分页
 */
export function DataTableCard({
  icon,
  title,
  description,
  actions,
  filters,
  footer,
  pagination,
  className,
  contentClassName,
  children,
}) {
  return (
    <Card className={className}>
      {(title || actions || filters) && (
        <ListPageHeader
          icon={icon}
          title={title}
          description={description}
          actions={actions}
          filters={filters}
        />
      )}
      <CardContent className={cn("p-0", contentClassName)}>
        {children}
        {pagination && pagination.total > 0 ? (
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            from={pagination.from}
            to={pagination.to}
            pageSize={pagination.pageSize}
            onPageChange={pagination.onPageChange || pagination.setPage}
          />
        ) : null}
        {footer}
      </CardContent>
    </Card>
  );
}
