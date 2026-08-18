import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 下拉选择：options=[{ value, label, disabled? }]。
 * 空字符串会转成未选中（Radix 不允许 value=""）。
 */
export function SelectField({
  value,
  onChange,
  options = [],
  placeholder,
  disabled,
  className,
  id,
  ...props
}) {
  const selectValue = value === "" || value == null ? undefined : String(value);

  return (
    <Select
      value={selectValue}
      onValueChange={onChange}
      disabled={disabled}
      {...props}
    >
      <SelectTrigger id={id} className={cn(className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem
            key={String(opt.value)}
            value={String(opt.value)}
            disabled={opt.disabled}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
