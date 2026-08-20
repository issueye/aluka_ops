import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationBar } from "@/components/ui/pagination";
import { PageShell } from "./PageShell";
import { ListPageHeader } from "./ListPageHeader";
import { RefreshButton } from "./RefreshButton";
import { InlineAlert } from "./InlineAlert";
import { Title } from "./Title";

/**
 * 通用页面模板组件（PageTemplate）
 * 统一所有页面的头部、返回导航、刷新控制、错误横幅与内容区布局
 *
 * list 模式（源力设计列表页）：页头（标题+描述|刷新+操作）→ 筛选栏 → 表格容器（带边框圆角）→ 分页表尾
 */
export function PageTemplate({
  // 头部属性
  icon,
  title,
  description,
  badge,
  backTo,
  backLabel = "返回",

  // 操作栏
  actions,
  onRefresh,
  isRefreshing = false,
  showRefresh = false,

  // 横幅与状态
  error,
  errorTitle,
  banner,

  // 列表页布局（源力设计）
  list = false,
  filters,

  // 容器配置
  card = false,
  cardTitle,
  cardDescription,
  cardIcon,
  cardActions,
  cardFilters,
  cardContentClassName,
  footer,
  pagination,

  // 布局
  className,
  contentClassName,
  maxWidth,
  children,
  ...props
}) {
  const hasPageHeader = Boolean(title || description || icon || backTo || actions || showRefresh || onRefresh);

  const headerActions = (
    <div className="flex items-center gap-1.5">
      {(showRefresh || onRefresh) && (
        <>
          <RefreshButton onClick={onRefresh} loading={isRefreshing} iconOnly />
          {actions ? <span className="mx-1 h-4 w-px shrink-0 bg-border1" aria-hidden /> : null}
        </>
      )}
      {actions}
    </div>
  );

  const renderPagination = () =>
    pagination && pagination.total > 0 ? (
      <PaginationBar
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        from={pagination.from}
        to={pagination.to}
        pageSize={pagination.pageSize}
        onPageChange={pagination.onPageChange || pagination.setPage}
      />
    ) : null;

  const pageTitle = hasPageHeader ? (
    <Title
      icon={icon}
      title={title}
      description={description}
      badge={badge}
      backTo={backTo}
      backLabel={backLabel}
      actions={headerActions}
    />
  ) : null;

  return (
    <PageShell className={cn(maxWidth, className)} {...props}>
      {banner}

      {error && (
        <InlineAlert variant="error" title={errorTitle}>
          {typeof error === "string" ? error : error?.message || "数据加载失败，请检查网络或后端服务。"}
        </InlineAlert>
      )}

      {list ? (
        <>
          {pageTitle}
          {filters ? (
            <div className="flex flex-wrap items-center gap-3">{filters}</div>
          ) : null}
          <div
            className={cn(
              "overflow-hidden rounded-md border border-border1 bg-bg1",
              contentClassName
            )}
          >
            {children}
            {renderPagination()}
            {footer}
          </div>
        </>
      ) : (
        <>
          {hasPageHeader && !card && pageTitle}

          {card ? (
            <Card className={contentClassName}>
              {(cardTitle || title || cardActions || actions || cardFilters || icon || cardIcon) && (
                <ListPageHeader
                  icon={cardIcon || icon}
                  title={cardTitle || title}
                  description={cardDescription || description}
                  filters={cardFilters}
                  actions={
                    <>
                      {(showRefresh || onRefresh) && (
                        <RefreshButton onClick={onRefresh} loading={isRefreshing} iconOnly />
                      )}
                      {cardActions || actions}
                    </>
                  }
                />
              )}
              <CardContent className={cn("p-0", cardContentClassName)}>
                {children}
                {renderPagination()}
                {footer}
              </CardContent>
            </Card>
          ) : (
            <div className={cn("space-y-5", contentClassName)}>{children}</div>
          )}
        </>
      )}
    </PageShell>
  );
}
