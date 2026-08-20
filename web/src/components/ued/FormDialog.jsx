import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoHint } from "./InfoHint";
import { Button } from "@/components/ui/button";

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  width = "max-w-lg",
  scrollBody = true,
  footer,
  onSubmit,
  submitText = "保存",
  submitDisabled = false,
  loading = false,
  cancelText = "取消",
  onCancel,
  className,
  children,
  ...props
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(84vh,760px)] flex-col gap-0 p-0 sm:rounded-md",
          width,
          className
        )}
        {...props}
      >
        <DialogHeader className="shrink-0 border-b border-border1 px-6 py-4">
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold leading-6">
              {title}
              {description ? <InfoHint label={description} contentClassName="max-w-sm" /> : null}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className={cn(scrollBody ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5" : "px-6 py-5", "space-y-4")}>{children}</div>

        <DialogFooter className="shrink-0 border-t border-border1 bg-bg1 px-6 py-3 sm:py-3">
          {footer !== undefined ? (
            footer
          ) : (
            <>
              <Button variant="outline" type="button" onClick={() => (onCancel ? onCancel() : onOpenChange?.(false))}>
                {cancelText}
              </Button>
              <Button type={onSubmit ? "submit" : "button"} disabled={submitDisabled || loading} onClick={onSubmit}>
                {loading ? "处理中..." : submitText}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
