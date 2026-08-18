import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";

/**
 * 页面 / 区块标题（源力设计）：返回 + 图标 + 标题 + 徽章 + 描述 | 右侧操作
 * @param {"page"|"section"} level
 */
export function Title({
  level = "page",
  icon: IconComp,
  title,
  description,
  badge,
  actions,
  backTo,
  backLabel = "返回",
  className,
}) {
  const Heading = level === "section" ? "h2" : "h1";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {backTo ? (
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-8 w-8 shrink-0 active:scale-90"
            aria-label={backLabel}
          >
            <Link to={backTo}>
              <Icon icon={ArrowLeft} size="md" />
            </Link>
          </Button>
        ) : null}
        {IconComp ? (
          <Icon icon={IconComp} size={level === "page" ? "lg" : "md"} className="text-text3" />
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {title ? (
              <Heading
                className={cn(
                  "truncate text-text1",
                  level === "page"
                    ? "text-xl font-semibold leading-7"
                    : "text-sm font-medium leading-6"
                )}
              >
                {title}
              </Heading>
            ) : null}
            {badge}
          </div>
          {description ? (
            <p
              className={cn(
                "mt-1 text-text3",
                level === "page" ? "text-[13px] leading-5" : "text-xs leading-5"
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function SectionTitle(props) {
  return <Title level="section" {...props} />;
}
