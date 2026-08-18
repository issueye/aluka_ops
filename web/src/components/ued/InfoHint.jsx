import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * 提示图标（源力设计）：将副标题/描述等次要信息收纳为悬停提示,保持界面简洁。
 * 支持 tooltipProps 透传(如 side / align)。
 */
export function InfoHint({ label, icon: Icon = Info, className, tooltipProps = {}, contentClassName }) {
  if (!label) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={-1}
          role="presentation"
          className={cn(
            "inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-text4 transition-colors hover:text-text3",
            className
          )}
          aria-label={typeof label === "string" ? label : undefined}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        {...tooltipProps}
        className={cn("max-w-xs text-xs leading-relaxed", contentClassName)}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
