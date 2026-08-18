import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * 带文案的 Switch。boxed=true 时为描边行（表单布尔字段）。
 */
export function LabeledSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  boxed = false,
  className,
}) {
  const body = (
    <>
      <div className="min-w-0">
        {label ? (
          <Label htmlFor={id} className="cursor-pointer">
            {label}
          </Label>
        ) : null}
        {description ? <p className="text-xs text-text3">{description}</p> : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={typeof label === "string" ? label : undefined}
      />
    </>
  );

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        boxed && "rounded-md border border-border1 px-3 py-2",
        className
      )}
    >
      {body}
    </div>
  );
}
