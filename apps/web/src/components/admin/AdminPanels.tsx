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
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
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
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "primary" | "neutral" | "danger";
  disabled?: boolean;
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
      className={`inline-flex min-h-9 items-center justify-center rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function AdminFilterTabs<T extends string>({
  filters,
  active,
  onChange,
}: {
  filters: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-4 pb-0">
      {filters.map((filter) => {
        const isActive = filter.id === active;
        return (
          <button
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition ${
              isActive
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
            key={filter.id}
            onClick={() => onChange(filter.id)}
            type="button"
          >
            {filter.label}
            {typeof filter.count === "number" ? (
              <span
                className={`rounded-full px-1.5 text-[0.65rem] ${
                  isActive ? "bg-white/20" : "bg-slate-100"
                }`}
              >
                {filter.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AdminNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#cfe3ff] bg-[#f0f7ff] px-4 py-3 text-sm font-semibold text-[#1b4f9c]">
      {children}
    </div>
  );
}
