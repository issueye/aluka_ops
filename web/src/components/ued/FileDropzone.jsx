import { useRef } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 自定义文件投放区（隐藏原生 file input，外层 UED 样式）
 */
export function FileDropzone({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  className,
  children,
  hint = "点击或拖拽文件到此处",
}) {
  const inputRef = useRef(null);

  const handleFiles = (list) => {
    if (!list?.length || disabled) return;
    onFiles?.(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {children || (
        <>
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{hint}</p>
        </>
      )}
    </div>
  );
}
