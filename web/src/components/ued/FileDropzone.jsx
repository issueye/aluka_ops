import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 自定义文件投放区（源力设计：隐藏原生 file input，外层 UED 样式与拖拽反馈动效）
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
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (list) => {
    if (!list?.length || disabled) return;
    onFiles?.(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed border-border2 bg-bg2 px-4 py-8 text-center transition-all duration-200 hover:border-primary-4 hover:bg-primary-1",
        isDragOver && "border-primary bg-primary-2 scale-[1.01] shadow-sm",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
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
          <div
            className={cn(
              "mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg4 text-text3 transition-transform duration-200 group-hover:scale-110",
              isDragOver && "bg-primary-2 text-primary scale-110"
            )}
          >
            <Upload className="h-6 w-6 stroke-[1.75]" />
          </div>
          <p className="text-sm font-medium text-text1">{hint}</p>
          <p className="mt-1 text-xs text-text3">支持点击选择或直接拖拽投放</p>
        </>
      )}
    </div>
  );
}
