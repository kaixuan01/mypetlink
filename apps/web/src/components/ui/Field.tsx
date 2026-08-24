"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

export type FieldProps = {
  label: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  htmlFor?: string;
  id?: string;
  helperText?: ReactNode;
  errorText?: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
};

export function Field({
  label,
  children,
  htmlFor,
  id,
  helperText,
  errorText,
  required = false,
  optional = false,
  className,
}: FieldProps) {
  const generatedId = useId();
  const baseId = id ?? htmlFor ?? `field-${generatedId}`;
  const labelId = `${baseId}-label`;
  const helperId = helperText ? `${baseId}-helper` : undefined;
  const errorId = errorText ? `${baseId}-error` : undefined;
  const control = Children.only(children);

  if (!isValidElement(control)) {
    throw new Error("Field requires exactly one valid control element.");
  }

  const existingDescribedBy = control.props["aria-describedby"];
  const describedBy = [
    typeof existingDescribedBy === "string" ? existingDescribedBy : undefined,
    helperId,
    errorId,
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  const controlProps: Record<string, unknown> = {
    "aria-describedby": describedBy,
    "aria-invalid": errorText ? true : control.props["aria-invalid"],
    "aria-required": required || control.props["aria-required"] || undefined,
  };

  if (htmlFor) {
    controlProps.id = htmlFor;
    if (required) controlProps.required = control.props.required ?? true;
  } else {
    controlProps["aria-labelledby"] = [
      typeof control.props["aria-labelledby"] === "string"
        ? control.props["aria-labelledby"]
        : undefined,
      labelId,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className={`grid min-w-0 gap-2 ${className ?? ""}`}>
      {htmlFor ? (
        <label className="text-sm font-bold text-pet-ink" htmlFor={htmlFor} id={labelId}>
          <FieldLabelContent label={label} optional={optional} required={required} />
        </label>
      ) : (
        <span className="text-sm font-bold text-pet-ink" id={labelId}>
          <FieldLabelContent label={label} optional={optional} required={required} />
        </span>
      )}

      {cloneElement(control, controlProps)}

      {helperText ? (
        <span className="text-xs leading-5 text-pet-muted" id={helperId}>
          {helperText}
        </span>
      ) : null}
      {errorText ? (
        <span className="text-xs font-bold text-[#a63c2e]" id={errorId}>
          {errorText}
        </span>
      ) : null}
    </div>
  );
}

function FieldLabelContent({
  label,
  optional,
  required,
}: {
  label: ReactNode;
  optional: boolean;
  required: boolean;
}) {
  return (
    <>
      {label}
      {required ? <span aria-hidden="true"> *</span> : null}
      {!required && optional ? (
        <span className="font-semibold text-pet-muted"> (optional)</span>
      ) : null}
    </>
  );
}
