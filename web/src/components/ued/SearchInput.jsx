import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Icon } from "./Icon";

/**
 * 筛选栏搜索框（源力设计：图标 + 无边框输入）。
 * onChange 接收字符串，可直接 onChange={setKeyword}
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "搜索",
  className,
  width = "w-44",
  ...props
}) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-sm bg-bg1 px-3 shadow-[0_0_0_1px_var(--border-2)]",
        className
      )}
    >
      <Icon icon={Search} size="md" className="text-text3" />
      <Input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-8 border-none bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0",
          width
        )}
        {...props}
      />
    </div>
  );
}
