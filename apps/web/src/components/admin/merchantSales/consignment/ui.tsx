"use client";

import { useId, type ReactNode } from "react";
import { AdminStatusBadge, type AdminStatusTone } from "@/components/admin/AdminStatus";
import { DateInput } from "@/components/ui/DateInput";
import { Icon } from "@/components/ui/Icon";
import { fieldClass, secondaryButton } from "../shared";
import type { NextStep, Stage } from "./model";

// Small presentational pieces shared by the Consignment views.

export const dangerButton =
  "min-h-11 rounded-full border border-[#ffd2c9] bg-[#fff2ef] px-4 text-sm font-black text-[#a63c2e] hover:bg-[#ffe3dc] disabled:cursor-not-allowed disabled:opacity-50";
export const textButton =
  "min-h-9 rounded-full px-2 text-sm font-black text-pet-teal underline-offset-4 hover:underline disabled:opacity-50";
export const textAreaClass =
  "min-h-24 w-full rounded-xl border border-pet-border bg-white px-3 py-2 font-semibold text-pet-ink outline-none focus:border-pet-teal disabled:bg-slate-100";

export function StatusPill({ tone, children }: { tone: AdminStatusTone; children: ReactNode }) {
  return (
    <AdminStatusBadge dot tone={tone}>
      {children}
    </AdminStatusBadge>
  );
}

export function NextStepCell({ step }: { step: NextStep }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="text-sm font-black text-slate-900">{step.label}</span>
      <span className="text-xs text-slate-500">{step.detail}</span>
    </span>
  );
}

/** A horizontal stage track. Completion is shown by icon and text, never colour alone. */
export function WorkflowStepper({ stages, label }: { stages: Stage[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {stages.map((stage, index) => (
          <li
            aria-current={stage.state === "current" ? "step" : undefined}
            className="flex items-center gap-1"
            key={stage.id}
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={`h-0.5 w-3 rounded-full sm:w-5 ${stage.state === "upcoming" ? "bg-slate-200" : "bg-[#1d9a68]"}`}
              />
            ) : null}
            <span
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold ${
                stage.state === "done"
                  ? "border-[#bfe7d4] bg-[#eefaf4] text-[#166b48]"
                  : stage.state === "current"
                    ? "border-pet-teal bg-[#e8f3ff] text-pet-teal"
                    : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 place-items-center rounded-full text-[0.65rem] ${
                  stage.state === "done"
                    ? "bg-[#1d9a68] text-white"
                    : stage.state === "current"
                      ? "bg-pet-teal text-white"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {stage.state === "done" ? <Icon className="h-3 w-3" name="check" /> : index + 1}
              </span>
              {stage.label}
              <span className="sr-only">
                {stage.state === "done" ? " (complete)" : stage.state === "current" ? " (next)" : " (not started)"}
              </span>
            </span>
          </li>
        ))}
    </ol>
  );
}

export type Requirement = "required" | "approval" | "optional";

const requirementText: Record<Requirement, string> = {
  required: "Required",
  approval: "Needed before approval",
  optional: "Optional",
};

/** Label, requirement, hint and error for one control. */
export function FieldShell({
  label,
  requirement,
  hint,
  error,
  children,
  id,
}: {
  label: string;
  requirement?: Requirement;
  hint?: ReactNode;
  error?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label className="text-sm font-black text-slate-800" htmlFor={id}>
          {label}
        </label>
        {requirement ? (
          <span
            className={`text-[0.7rem] font-extrabold uppercase tracking-wide ${
              requirement === "required" ? "text-[#a63c2e]" : requirement === "approval" ? "text-[#8a5a10]" : "text-slate-400"
            }`}
          >
            {requirementText[requirement]}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p className="text-xs leading-5 text-slate-500" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-bold text-[#a63c2e]" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

type BaseFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  requirement?: Requirement;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function TextField({
  type = "text",
  inputMode,
  min,
  max,
  step,
  maxLength = 2000,
  list,
  ...props
}: BaseFieldProps & {
  type?: "text" | "number" | "datetime-local";
  inputMode?: "decimal" | "numeric";
  min?: string;
  max?: string;
  step?: string;
  maxLength?: number;
  list?: string;
}) {
  const id = useId();
  const control = {
    "aria-describedby": describedBy(id, props.hint, props.error),
    "aria-invalid": props.error ? true : undefined,
    disabled: props.disabled,
    id,
    onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
    value: props.value,
  };
  return (
    <FieldShell error={props.error} hint={props.hint} id={id} label={props.label} requirement={props.requirement}>
      {type === "datetime-local" ? (
        <DateInput {...control} className={fieldClass} type="datetime-local" />
      ) : (
        <input
          {...control}
          className={fieldClass}
          inputMode={inputMode}
          list={list}
          max={max}
          maxLength={type === "number" ? undefined : maxLength}
          min={min}
          placeholder={props.placeholder}
          step={step}
          type={type}
        />
      )}
    </FieldShell>
  );
}

export function DateField(props: BaseFieldProps & { min?: string }) {
  const id = useId();
  return (
    <FieldShell error={props.error} hint={props.hint} id={id} label={props.label} requirement={props.requirement}>
      <DateInput
        aria-describedby={describedBy(id, props.hint, props.error)}
        aria-invalid={props.error ? true : undefined}
        className={fieldClass}
        disabled={props.disabled}
        id={id}
        min={props.min}
        onChange={(event) => props.onChange(event.target.value)}
        type="date"
        value={props.value}
      />
    </FieldShell>
  );
}

export function TextAreaField(props: BaseFieldProps & { rows?: number }) {
  const id = useId();
  return (
    <FieldShell error={props.error} hint={props.hint} id={id} label={props.label} requirement={props.requirement}>
      <textarea
        aria-describedby={describedBy(id, props.hint, props.error)}
        aria-invalid={props.error ? true : undefined}
        className={textAreaClass}
        disabled={props.disabled}
        id={id}
        maxLength={2000}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        rows={props.rows ?? 3}
        value={props.value}
      />
    </FieldShell>
  );
}

export function SelectField({
  options,
  emptyLabel,
  ...props
}: BaseFieldProps & { options: { value: string; label: string }[]; emptyLabel: string }) {
  const id = useId();
  return (
    <FieldShell error={props.error} hint={props.hint} id={id} label={props.label} requirement={props.requirement}>
      <select
        aria-describedby={describedBy(id, props.hint, props.error)}
        aria-invalid={props.error ? true : undefined}
        className={fieldClass}
        disabled={props.disabled}
        id={id}
        onChange={(event) => props.onChange(event.target.value)}
        value={props.value}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** A recorded term, or a quiet statement that it has not been agreed. */
export function TermValue({ value }: { value: ReactNode }) {
  return value === null || value === undefined || value === "" ? (
    <span className="font-semibold italic text-slate-400">Not agreed yet</span>
  ) : (
    <>{value}</>
  );
}

export function TermGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</h4>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function Term({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl bg-slate-50 px-3 py-2.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm font-bold text-slate-900">{children}</dd>
    </div>
  );
}

export function ProgressMeter({ value, total, label }: { value: number; total: number; label: string }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="grid min-w-32 gap-1">
      <span className="text-xs font-bold text-slate-700">
        {value} of {total} confirmed
      </span>
      <div
        aria-label={`${label}: ${value} of ${total} confirmed`}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={value}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
      >
        <div
          className={`h-full rounded-full ${value === total && total > 0 ? "bg-[#0f8a5f]" : "bg-[#1570ef]"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function Pager({
  page,
  total,
  pageSize,
  onPage,
  noun,
  plural = `${noun}s`,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  noun: string;
  plural?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page === 1) {
    return (
      <p className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-5">
        {total} {total === 1 ? noun : plural}
      </p>
    );
  }
  return (
    <nav aria-label={`${plural} pages`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <span className="text-xs font-semibold text-slate-500">
        Page {page} of {pages} · {total} {plural}
      </span>
      <span className="flex gap-2">
        <button className={secondaryButton} disabled={page === 1} onClick={() => onPage(page - 1)} type="button">
          Previous
        </button>
        <button className={secondaryButton} disabled={page * pageSize >= total} onClick={() => onPage(page + 1)} type="button">
          Next
        </button>
      </span>
    </nav>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: "info" | "warning" | "critical";
  title?: string;
  children: ReactNode;
  role?: "alert" | "status" | "note";
}) {
  const tones = {
    info: "border-[#cfe3ff] bg-[#f0f7ff] text-[#1b4f9c]",
    warning: "border-[#f6dfae] bg-[#fdf6e7] text-[#7a4f0d]",
    critical: "border-[#ffd2c9] bg-[#fff2ef] text-[#a63c2e]",
  };
  return (
    <div className={`min-w-0 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`} role={role}>
      {title ? <p className="font-black">{title}</p> : null}
      <div className={`${title ? "mt-1" : ""} font-semibold leading-6`}>{children}</div>
    </div>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full px-1 text-sm font-black text-slate-600 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pet-teal"
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4 rotate-90" name="chevron" />
      {label}
    </button>
  );
}
