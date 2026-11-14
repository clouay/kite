import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface NumberInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: number | undefined | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  fallbackOnBlur?: number;
}

/**
 * A controlled number input that allows the user to completely delete the text
 * (leaving the box empty) while typing, without instantly snapping back to 0.
 * On blur or enter, if the box is left empty, it safely commits the fallback or 0.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step,
      fallbackOnBlur,
      className,
      onBlur,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    // Keep local text state so the user can backspace to empty
    const [localText, setLocalText] = React.useState<string>(() =>
      value !== undefined && value !== null && !isNaN(value) ? String(value) : ""
    );
    const [isFocused, setIsFocused] = React.useState(false);

    // Sync from prop only when NOT focused (avoids jumping while the user is typing)
    React.useEffect(() => {
      if (!isFocused) {
        const next =
          value !== undefined && value !== null && !isNaN(value) ? String(value) : "";
        setLocalText(next);
      }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setLocalText(raw);

      // Allow empty string or just "-" while typing
      if (raw === "" || raw === "-") {
        return;
      }

      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        // If min/max are defined, don't clamp too aggressively while typing unless specified
        onChange(parsed);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);

      if (localText === "" || localText === "-" || isNaN(parseInt(localText, 10))) {
        const fallback =
          fallbackOnBlur !== undefined
            ? fallbackOnBlur
            : min !== undefined
            ? min
            : 0;
        setLocalText(String(fallback));
        onChange(fallback);
      } else {
        let parsed = parseInt(localText, 10);
        if (min !== undefined && parsed < min) parsed = min;
        if (max !== undefined && parsed > max) parsed = max;
        setLocalText(String(parsed));
        onChange(parsed);
      }

      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      }
      onKeyDown?.(e);
    };

    return (
      <Input
        ref={ref}
        type="number"
        min={min}
        max={max}
        step={step}
        value={localText}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn("font-mono text-xs", className)}
        {...props}
      />
    );
  }
);

NumberInput.displayName = "NumberInput";
