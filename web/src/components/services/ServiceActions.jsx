import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Square, RotateCw } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

// ServiceActions 服务启停/重启动作按钮组。
//
// props:
//   service: 服务对象(含 id, status)
//   compact: 紧凑模式(仅图标,用于表格行内)
export function ServiceActions({ service, compact = false }) {
  const queryClient = useQueryClient();
  const isRunning = service.status === "running";
  const canStart = !isRunning; // created/stopped/crashed 均可启动

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["services"] });
    queryClient.invalidateQueries({ queryKey: ["service", service.id] });
    queryClient.invalidateQueries({ queryKey: ["operations"] });
  };

  // 通用 mutation 封装:成功后刷新列表 + toast,失败 toast。
  const useAction = (fn, okMsg, errMsg) =>
    useMutation({
      mutationFn: () => fn(service.id),
      onSuccess: (data) => {
        toast.success(okMsg);
        invalidate();
        // 动作返回里若含 operation,且非 success,展示后端错误
        if (data?.operation && data.operation.status !== "success") {
          toast.error(data.operation.error_msg || "操作未成功");
        }
      },
      onError: (e) => toast.error(`${errMsg}: ${e.message}`),
    });

  const startMut = useAction(serviceApi.start, "已启动", "启动失败");
  const stopMut = useAction(serviceApi.stop, "已停止", "停止失败");
  const restartMut = useAction(serviceApi.restart, "已重启", "重启失败");

  const busy = startMut.isPending || stopMut.isPending || restartMut.isPending;

  const size = compact ? "icon" : "sm";
  const labelCls = compact ? "" : "gap-2";

  return (
    <div className={compact ? "flex justify-end gap-1" : "flex gap-2"}>
      {canStart && (
        <Button
          size={size}
          variant="default"
          className={labelCls}
          disabled={busy}
          onClick={() => startMut.mutate()}
          title="启动"
        >
          <Play /> {!compact && "启动"}
        </Button>
      )}
      {isRunning && (
        <Button
          size={size}
          variant="destructive"
          className={labelCls}
          disabled={busy}
          onClick={() => stopMut.mutate()}
          title="停止"
        >
          <Square /> {!compact && "停止"}
        </Button>
      )}
      <Button
        size={size}
        variant="outline"
        className={labelCls}
        disabled={busy || (!isRunning && service.status === "created")}
        onClick={() => restartMut.mutate()}
        title="重启"
      >
        <RotateCw className={restartMut.isPending ? "animate-spin" : ""} />
        {!compact && "重启"}
      </Button>
    </div>
  );
}
