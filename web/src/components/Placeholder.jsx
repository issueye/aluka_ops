import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder:未实现模块的统一占位卡片。
// 阶段:该功能属于哪个里程碑(用于说明何时可用)。
export function Placeholder({ title, milestone = "后续阶段", features = [] }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Construction className="h-5 w-5 text-amber-400" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>
          该模块计划在 <span className="text-amber-400">{milestone}</span> 实现,当前为骨架占位。
        </CardDescription>
      </CardHeader>
      {features.length > 0 && (
        <CardContent>
          <p className="mb-2 text-xs font-medium text-muted-foreground">规划能力:</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
