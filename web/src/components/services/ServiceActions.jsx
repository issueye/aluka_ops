import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Square, RotateCw } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { IconTooltip, RowActions } from "@/components/ued";

export function ServiceActions({ service, compact = false }) {
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
  const size = compact ? "icon" : "sm";

  const wrap = (label, node) =>
    compact ? <IconTooltip label={label}>{node}</IconTooltip> : node;

  return (
    <RowActions className={compact ? undefined : "justify-start gap-2"}>
      {canStart &&
        wrap(
          "启动",
          <Button
            size={size}
            variant="default"
            disabled={busy}
            onClick={() => startMut.mutate()}
            aria-label="启动"
          >
            <Play /> {!compact && "启动"}
          </Button>
        )}
      {isRunning &&
        wrap(
          "停止",
          <Button
            size={size}
            variant="destructive"
            disabled={busy}
            onClick={() => stopMut.mutate()}
            aria-label="停止"
          >
            <Square /> {!compact && "停止"}
          </Button>
        )}
      {wrap(
        "重启",
        <Button
          size={size}
          variant="outline"
          disabled={busy || (!isRunning && service.status === "created")}
          onClick={() => restartMut.mutate()}
          aria-label="重启"
        >
          <RotateCw className={restartMut.isPending ? "animate-spin" : ""} />
          {!compact && "重启"}
        </Button>
      )}
    </RowActions>
  );
}
