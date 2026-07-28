import { Link } from "react-router-dom";
import { Package, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageShell } from "@/components/ued";

export function Artifacts() {
  return (
    <PageShell>
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <EmptyState
            icon={Package}
            title="制品管理"
            description="制品(安装包)归属于具体服务,请在对应服务的「版本」Tab 中管理。"
            action={
              <Button asChild>
                <Link to="/services">
                  前往服务列表 <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
