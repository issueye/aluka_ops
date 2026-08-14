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

/**
 * 通用页面模板组件（PageTemplate）
 * 统一所有页面的头部、返回导航、刷新控制、错误横幅与内容区布局
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

  return (
    <PageShell className={cn("space-y-4", maxWidth, className)} {...props}>
      {/* 顶部自定义横幅 */}
      {banner}

      {/* 全局错误警示 */}
      {error && (
        <InlineAlert variant="error" title={errorTitle}>
          {typeof error === "string" ? error : error?.message || "数据加载失败，请检查网络或后端服务。"}
        </InlineAlert>
      )}

      {/* 页面主标题栏（如果传入了标题、返回或顶部动作） */}
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
            {Icon && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {title && <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>}
                {badge}
              </div>
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>

          {/* 右侧动作区 */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(showRefresh || onRefresh) && (
              <RefreshButton onClick={onRefresh} loading={isRefreshing} />
            )}
            {actions}
          </div>
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
      ) : (
        <div className={contentClassName}>{children}</div>
      )}
    </PageShell>
  );
}
