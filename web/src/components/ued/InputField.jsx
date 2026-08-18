import { Input } from "@/components/ui/input";
import { FormField } from "./FormField";

/**
 * 带 Label / hint / error 的输入框，组合 FormField + Input。
 */
export function InputField({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  ...inputProps
}) {
  return (
    <FormField
      label={label}
      htmlFor={htmlFor}
      required={required}
      hint={hint}
      error={error}
      className={className}
    >
      <Input id={htmlFor} {...inputProps} />
    </FormField>
  );
}
