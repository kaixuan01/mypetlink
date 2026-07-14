"use client";

import type {
  ComponentPropsWithoutRef,
  MouseEvent as ReactMouseEvent,
} from "react";
import { Icon } from "@/components/ui/Icon";

type DateInputProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  type?: "date" | "datetime-local";
};

export function DateInput({
  className = "",
  disabled,
  onClick,
  readOnly,
  type = "date",
  ...props
}: DateInputProps) {
  function handleClick(event: ReactMouseEvent<HTMLInputElement>) {
    onClick?.(event);

    if (event.defaultPrevented || disabled || readOnly) {
      return;
    }

    try {
      event.currentTarget.showPicker();
    } catch {
      // The original click still preserves the platform's native fallback.
      event.currentTarget.focus();
    }
  }

  return (
    <span className="brand-date-field">
      <input
        {...props}
        className={`brand-input brand-date-input ${className}`.trim()}
        disabled={disabled}
        onClick={handleClick}
        readOnly={readOnly}
        type={type}
      />
      <span aria-hidden="true" className="brand-date-indicator">
        <Icon className="h-4 w-4" name="calendar" />
      </span>
    </span>
  );
}
