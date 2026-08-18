import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "./Icon";

/**
 * Tab 封装。items: [{ value, label, icon?, disabled?, content? }]
 * 复杂面板可继续用 children 放 TabsContent。
 */
export function TabBar({
  items = [],
  value,
  onValueChange,
  defaultValue,
  className,
  listClassName,
  children,
  ...props
}) {
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      defaultValue={defaultValue}
      className={cn("w-full", className)}
      {...props}
    >
      <TabsList className={cn("w-full overflow-x-auto", listClassName)}>
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="shrink-0"
          >
            {item.icon ? <Icon icon={item.icon} size="sm" className="mr-1.5" /> : null}
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item) =>
        item.content != null ? (
          <TabsContent key={item.value} value={item.value} className="mt-4">
            {item.content}
          </TabsContent>
        ) : null
      )}
      {children}
    </Tabs>
  );
}

export { TabsContent };
