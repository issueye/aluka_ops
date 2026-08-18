import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Square, RotateCw } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RowActions, TextActionButton } from "@/components/ued";

export function ServiceActions({ service, className }) {
  const queryClient = useQueryClient();
  const isRunning = service.status === "running";
  const canStart = !isRunning;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["services"] });
    queryClient.invalidateQueries({ queryKey: ["service", service.id] });
    queryClient.invalidateQueries({ queryKey: ["operations"] });
  };

  const useAction = (fn, okMsg, errMsg) =>
    useMutation({
      mutationFn: () => fn(service.id),
      onSuccess: (data) => {
        toast.success(okMsg);
        invalidate();
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

  return (
    <RowActions className={className}>
      {canStart && (
        <TextActionButton
          disabled={busy}
          onClick={() => startMut.mutate()}
          aria-label="启动"
        >
          <Play className="h-3 w-3" /> 启动
        </TextActionButton>
      )}
      {isRunning && (
        <TextActionButton
          tone="danger"
          disabled={busy}
          onClick={() => stopMut.mutate()}
          aria-label="停止"
        >
          <Square className="h-3 w-3" /> 停止
        </TextActionButton>
      )}
      <TextActionButton
        disabled={busy || (!isRunning && service.status === "created")}
        onClick={() => restartMut.mutate()}
        aria-label="重启"
      >
        <RotateCw className={cn("h-3 w-3", restartMut.isPending && "animate-spin")} /> 重启
      </TextActionButton>
    </RowActions>
  );
}
