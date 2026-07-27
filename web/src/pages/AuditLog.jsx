import { Placeholder } from "@/components/Placeholder";

export function AuditLog() {
  return (
    <Placeholder
      title="审计日志"
      milestone="M6"
      features={[
        "所有写操作的留痕(install/upgrade/uninstall/config 等)",
        "操作人、时间、目标、详情",
        "按操作类型筛选",
      ]}
    />
  );
}
