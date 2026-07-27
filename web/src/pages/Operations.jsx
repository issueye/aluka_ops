import { Placeholder } from "@/components/Placeholder";

export function Operations() {
  return (
    <Placeholder
      title="操作记录"
      milestone="M2"
      features={[
        "服务操作历史(install/start/stop/restart/upgrade/uninstall)",
        "操作状态与详细输出日志",
        "按服务、类型、状态筛选",
      ]}
    />
  );
}
