import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationBar } from "@/components/ui/pagination";
import { PageShell } from "./PageShell";
import { ListPageHeader } from "./ListPageHeader";
import { RefreshButton } from "./RefreshButton";
import { InlineAlert } from "./InlineAlert";
import { InfoHint } from "./InfoHint";

/**
 * 通用页面模板组件（PageTemplate）
 * 统一所有页面的头部、返回导航、刷新控制、错误横幅与内容区布局
 *
 * list 模式（源力设计列表页）：页头（标题+描述|刷新+操作）→ 筛选栏 → 表格容器（带边框圆角）→ 分页表尾
 */
export function PageTemplate({
  // 头部属性
  icon: Icon,
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
  const hasPageHeader = Boolean(title || description || Icon || backTo || actions || showRefresh || onRefresh);

  const renderHeaderActions = () => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {(showRefresh || onRefresh) && (
        <RefreshButton onClick={onRefresh} loading={isRefreshing} />
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

  return (
    <PageShell className={cn(maxWidth, className)} {...props}>
      {/* 顶部自定义横幅 */}
      {banner}

      {/* 全局错误警示 */}
      {error && (
        <InlineAlert variant="error" title={errorTitle}>
          {typeof error === "string" ? error : error?.message || "数据加载失败，请检查网络或后端服务。"}
        </InlineAlert>
      )}

      {/* ═══ 列表页布局（源力设计：页头 + 筛选栏 + 表格容器 + 分页表尾）═══ */}
      {list ? (
        <>
          {hasPageHeader && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {backTo && (
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="h-8 w-8 shrink-0 active:scale-90"
                    aria-label={backLabel}
                  >
                    <Link to={backTo}>
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {title && (
                      <h1 className="truncate text-xl font-semibold leading-7 text-text1">{title}</h1>
                    )}
                    {badge}
                  </div>
                  {description ? (
                    <p className="mt-1 text-[13px] leading-5 text-text3">{description}</p>
                  ) : null}
                </div>
              </div>
              {renderHeaderActions()}
            </div>
          )}

          {/* 筛选栏 */}
          {filters ? (
            <div className="flex flex-wrap items-center gap-3">{filters}</div>
          ) : null}

          {/* 表格容器：带边框圆角，分页内嵌为表尾 */}
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
          {/* 页面主标题栏（源力设计：标题 + 描述 + 右侧操作） */}
          {hasPageHeader && !card && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {backTo && (
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="h-8 w-8 shrink-0 active:scale-90"
                    aria-label={backLabel}
                  >
                    <Link to={backTo}>
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                {Icon && <Icon className="h-5 w-5 shrink-0 text-text3" />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {title && (
                      <h1 className="truncate text-xl font-semibold leading-7 text-text1">{title}</h1>
                    )}
                    {badge}
                  </div>
                  {description ? (
                    <p className="mt-1 text-[13px] leading-5 text-text3">{description}</p>
                  ) : null}
                </div>
              </div>
              {renderHeaderActions()}
            </div>
          )}

          {/* 内容区域：如果启用 card 模式则统一放入 Card / DataTable 容器 */}
          {card ? (
            <Card className={contentClassName}>
              {(cardTitle || title || cardActions || actions || cardFilters || Icon || cardIcon) && (
                <ListPageHeader
                  icon={cardIcon || Icon}
                  title={cardTitle || title}
                  description={cardDescription || description}
                  filters={cardFilters}
                  actions={
                    <>
                      {(showRefresh || onRefresh) && (
                        <RefreshButton onClick={onRefresh} loading={isRefreshing} />
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
