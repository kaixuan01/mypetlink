"use client";

import { useId, type MouseEvent, type ReactNode } from "react";

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
  const rowClassName = `flex min-h-14 w-full min-w-0 items-start justify-between gap-4 rounded-2xl bg-pet-cream p-4 text-left transition ${
    disabled
      ? "cursor-not-allowed text-pet-muted opacity-70"
      : "cursor-pointer text-pet-ink hover:bg-pet-apricot"
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

  function handleRowClick(event: MouseEvent<HTMLDivElement>) {
    if (
      disabled ||
      isInteractiveDescendant(event.target, event.currentTarget)
    ) {
      return;
    }
    onChange(!checked);
  }

  return (
    <div className={rowClassName} data-setting-row onClick={handleRowClick}>
      {copy}
      {control === "switch" ? (
        <button
          aria-checked={checked}
          aria-describedby={helperId}
          aria-labelledby={labelId}
          className="grid min-h-11 min-w-14 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
          disabled={disabled}
          id={controlId}
          onClick={() => onChange(!checked)}
          role="switch"
          type="button"
        >
          <span
            aria-hidden="true"
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
              checked ? "bg-pet-teal" : "bg-pet-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                checked ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      ) : (
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
      )}
    </div>
  );
}

function isInteractiveDescendant(target: EventTarget, row: HTMLElement) {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(
    'a[href], button, input, select, textarea, [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="combobox"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])'
  );
  return interactive !== null && row.contains(interactive);
}
