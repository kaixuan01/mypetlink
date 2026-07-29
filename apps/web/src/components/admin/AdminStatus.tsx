import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

// Status primitives shared by the operations configuration pages
// (Email Templates, Delivery Rates, Operational Status).
//
// Admin screens are scanned, not read. These components exist so a state is
// recognisable by shape and colour before the label is read, and so the three
// pages express the same state the same way.

export type AdminStatusTone =
  // Working as intended.
  | "positive"
  // Deliberately off, or simply nothing to report. Never alarming.
  | "neutral"
  // Needs a decision, but nothing is broken.
  | "warning"
  // Something is blocked or incomplete.
  | "critical"
  | "info";

const badgeTones: Record<AdminStatusTone, string> = {
  positive: "border-[#bfe7d4] bg-[#eefaf4] text-[#166b48]",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  warning: "border-[#f6dfae] bg-[#fdf6e7] text-[#8a5a10]",
  critical: "border-[#ffd2c9] bg-[#fff2ef] text-[#a63c2e]",
  info: "border-[#cfe3ff] bg-[#f0f7ff] text-[#1b4f9c]",
};

const dotTones: Record<AdminStatusTone, string> = {
  positive: "bg-[#1d9a68]",
  neutral: "bg-slate-400",
  warning: "bg-[#c78a1c]",
  critical: "bg-[#d1553d]",
  info: "bg-[#2f6fd0]",
};

/**
 * Compact state pill. `dot` adds a colour cue so the state reads before the
 * word does.
 */
export function AdminStatusBadge({
  children,
  tone = "neutral",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: AdminStatusTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-extrabold ${badgeTones[tone]} ${className}`}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTones[tone]}`}
        />
      ) : null}
      {children}
    </span>
  );
}

const iconTones: Record<AdminStatusTone, string> = {
  positive: "bg-[#eefaf4] text-[#166b48]",
  neutral: "bg-slate-100 text-slate-500",
  warning: "bg-[#fdf6e7] text-[#8a5a10]",
  critical: "bg-[#fff2ef] text-[#a63c2e]",
  info: "bg-[#f0f7ff] text-[#1b4f9c]",
};

/**
 * Headline status card for the one or two facts that decide whether the rest
 * of the page matters — for example whether email can be delivered at all.
 */
export function AdminStatusCard({
  label,
  status,
  tone = "neutral",
  detail,
  icon = "settings",
  footnote,
}: {
  label: string;
  status: string;
  tone?: AdminStatusTone;
  detail?: string;
  icon?: IconName;
  footnote?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-lg font-black leading-tight text-slate-950 sm:text-xl">
            {status}
          </p>
        </div>
        <span className={`shrink-0 rounded-xl p-2.5 ${iconTones[tone]}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      {detail ? (
        <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
      ) : null}
      {footnote ? <div className="mt-3">{footnote}</div> : null}
    </div>
  );
}

const statAccents: Record<AdminStatusTone, string> = {
  positive: "text-[#166b48]",
  neutral: "text-slate-900",
  warning: "text-[#8a5a10]",
  critical: "text-[#a63c2e]",
  info: "text-[#1b4f9c]",
};

/**
 * One number in a KPI strip. Zero is rendered muted so a calm page stays calm
 * and a non-zero count is what draws the eye.
 */
export function AdminStat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: AdminStatusTone;
  hint?: string;
}) {
  const isZero = value === 0 || value === "0";
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
      <p
        className={`text-xl font-black leading-none sm:text-2xl ${
          isZero ? "text-slate-300" : statAccents[tone]
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[0.7rem] font-bold leading-tight text-slate-500 sm:text-xs">
        {label}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[0.65rem] leading-tight text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Responsive KPI row. Wraps to two columns on the narrowest screens. */
export function AdminStatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
      {children}
    </div>
  );
}

/**
 * Label/value line for read-only panels. `tone` is applied to the value so a
 * problem is visible without reading the whole card.
 */
export function AdminStatusRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: AdminStatusTone;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-100 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <span className="text-sm text-slate-600">{label}</span>
        {hint ? (
          <p className="text-xs leading-tight text-slate-400">{hint}</p>
        ) : null}
      </div>
      <span
        className={`shrink-0 text-sm font-bold ${
          tone ? statAccents[tone] : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Quiet, non-alarming empty state for a section that simply has nothing yet. */
export function AdminEmptyPanel({
  title,
  description,
  icon = "settings",
}: {
  title: string;
  description?: string;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="rounded-2xl bg-slate-100 p-3 text-slate-400">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-black text-slate-700">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          {description}
        </p>
      ) : null}
    </div>
  );
}
