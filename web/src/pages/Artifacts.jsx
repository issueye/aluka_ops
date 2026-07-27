import { Link } from "react-router-dom";
import { Package, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Artifacts 顶层制品入口。
// 制品归属于具体服务,因此此页引导用户进入服务详情的「版本」Tab。
export function Artifacts() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <CardTitle>制品管理</CardTitle>
        </div>
        <CardDescription>
          制品(安装包)归属于具体服务,请在对应服务的「版本」Tab 中管理。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to="/services">
            前往服务列表 <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
