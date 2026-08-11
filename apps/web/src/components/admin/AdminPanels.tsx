import type { ReactNode } from "react";

// Compact building blocks shared by the operations pages. Admin screens are
// denser and more table-like than the owner portal, but reuse the same design
// tokens so the portal still feels like MyPetLink.

export function AdminSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    // min-w-0 lets the section shrink inside grid/flex parents so wide tables
    // scroll within their own container instead of stretching the page.
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {headers.map((header) => (
              <th className="whitespace-nowrap px-4 py-3" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function AdminDetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 break-words text-sm font-bold text-slate-900">
        {value || "Not set"}
      </p>
    </div>
  );
}

export function AdminActionButton({
  children,
  onClick,
  tone = "neutral",
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "primary" | "neutral" | "danger";
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const tones = {
    primary:
      "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
    neutral:
      "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    danger:
      "border-[#ffd2c9] bg-[#fff2ef] text-[#a63c2e] hover:bg-[#ffe3dc]",
  };

  return (
    <button
      aria-label={ariaLabel}
      className={`inline-flex min-h-9 items-center justify-center rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function AdminNotice({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#cfe3ff] bg-[#f0f7ff] px-4 py-3 text-sm font-semibold text-[#1b4f9c]">
      {children}
    </div>
  );
}

export function AdminOperationNotice({
  tone,
  title,
  detail,
  reference,
  actionLabel,
  onAction,
  onDismiss,
}: {
  tone: "success" | "error";
  title: string;
  detail?: string;
  reference?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  const isError = tone === "error";

  return (
    <div className="sticky top-[4.5rem] z-20 lg:top-4" data-testid="admin-operation-notice">
      <div
        aria-live={isError ? "assertive" : "polite"}
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
          isError
            ? "border-red-300 bg-red-50 text-red-900"
            : "border-emerald-300 bg-emerald-50 text-emerald-950"
        }`}
        role={isError ? "alert" : "status"}
      >
        <span aria-hidden="true" className="mt-0.5 shrink-0 font-black">
          {isError ? "!" : "✓"}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-black">{title}</p>
          {detail ? <p className="mt-1 font-semibold">{detail}</p> : null}
          {reference ? <p className="mt-1 break-all text-xs font-semibold opacity-70">Reference: {reference}</p> : null}
          {actionLabel && onAction ? (
            <button
              className="mt-2 min-h-9 rounded-full border border-current px-3 text-xs font-extrabold"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
        <button
          aria-label="Dismiss notification"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current text-lg font-black"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
}
