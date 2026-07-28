import { Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ued";

export function Placeholder({ title, milestone = "后续阶段", features = [] }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Construction className="h-5 w-5 text-warning" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          compact
          title={`计划在 ${milestone} 实现`}
          description={
            features.length
              ? `规划能力：${features.join("、")}`
              : "当前为骨架占位。"
          }
        />
      </CardContent>
    </Card>
  );
}
