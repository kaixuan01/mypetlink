"use client";

import { useId, type ReactNode } from "react";

export type SettingRowProps = {
  control: "switch" | "checkbox";
  checked: boolean;
  label: ReactNode;
  onChange: (checked: boolean) => void;
  helperText?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  name?: string;
};

export function SettingRow({
  control,
  checked,
  label,
  onChange,
  helperText,
  disabled = false,
  id,
  className,
  name,
}: SettingRowProps) {
  const generatedId = useId();
  const controlId = id ?? `setting-${generatedId}`;
  const labelId = `${controlId}-label`;
  const helperId = helperText ? `${controlId}-helper` : undefined;
  const rowClassName = `flex min-h-14 w-full min-w-0 items-start justify-between gap-4 rounded-2xl border p-4 text-left transition ${
    disabled
      ? "cursor-not-allowed border-pet-border bg-white/70 text-pet-muted"
      : "cursor-pointer border-[#cfe3ff] bg-white text-pet-ink hover:bg-[#f4f9ff]"
  } ${className ?? ""}`;
  const copy = (
    <span className="min-w-0">
      <span className="block text-sm font-bold" id={labelId}>
        {label}
      </span>
      {helperText ? (
        <span
          className="mt-1 block text-xs font-semibold leading-5 text-pet-muted"
          id={helperId}
        >
          {helperText}
        </span>
      ) : null}
    </span>
  );

  if (control === "switch") {
    return (
      <button
        aria-checked={checked}
        aria-describedby={helperId}
        aria-labelledby={labelId}
        className={rowClassName}
        disabled={disabled}
        id={controlId}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        {copy}
        <span
          aria-hidden="true"
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
            checked ? "bg-pet-teal" : "bg-[#cfd6e4]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              checked ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </span>
      </button>
    );
  }

  return (
    <label className={rowClassName} htmlFor={controlId}>
      {copy}
      <input
        aria-describedby={helperId}
        aria-labelledby={labelId}
        checked={checked}
        className="mt-0.5 h-5 w-5 shrink-0 accent-pet-teal"
        disabled={disabled}
        id={controlId}
        name={name}
        onChange={(event) => {
          if (!disabled) onChange(event.target.checked);
        }}
        type="checkbox"
      />
    </label>
  );
}
