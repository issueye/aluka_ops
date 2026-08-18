import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

/**
 * 「···」下拉菜单。items: [{ label, icon, onSelect, disabled, tone, type: "separator"|"label" }]
 */
export function MoreMenu({
  items = [],
  trigger,
  align = "end",
  label = "更多操作",
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" aria-label={label}>
            <Icon icon={MoreHorizontal} size="md" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, index) => {
          if (item.type === "separator") {
            return <DropdownMenuSeparator key={`sep-${index}`} />;
          }
          if (item.type === "label") {
            return (
              <DropdownMenuLabel key={item.label || `label-${index}`}>
                {item.label}
              </DropdownMenuLabel>
            );
          }
          return (
            <DropdownMenuItem
              key={item.key || item.label || index}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(item.tone === "danger" && "text-danger focus:text-danger")}
            >
              {item.icon ? <Icon icon={item.icon} size="sm" /> : null}
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
