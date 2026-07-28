import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * 统一危险确认弹窗（UED）
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = "确认操作？",
  description,
  confirmText = "确认",
  cancelText = "取消",
  loading = false,
  destructive = true,
  onConfirm,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            typeof description === "string" ? (
              <AlertDialogDescription>{description}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground">{description}</div>
              </AlertDialogDescription>
            )
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              onConfirm?.();
            }}
          >
            {loading ? "处理中..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
