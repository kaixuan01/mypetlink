import type { ReactNode } from "react";

/**
 * The quiet white surface the Dashboard's content sections share: a light
 * border and a soft shadow, rather than the heavier brand card, so stacked
 * sections never read as nested cards.
 */
export function DashboardPanel({
  id,
  title,
  action,
  busy = false,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;

  return (
    <section
      aria-busy={busy || undefined}
      aria-labelledby={headingId}
      className="min-w-0 rounded-[1.375rem] border border-pet-border bg-white p-4 shadow-[0_8px_24px_rgba(13,27,61,0.05)] sm:p-5"
      data-dashboard-panel={id}
    >
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <h2
          className="brand-heading min-w-0 text-lg font-bold leading-tight text-pet-ink sm:text-xl"
          id={headingId}
        >
          {title}
        </h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {busy ? <span className="sr-only">Loading {title}</span> : null}
      {children}
    </section>
  );
}

/** A section's empty or failed state: one honest sentence and one action. */
export function PanelMessage({
  title,
  children,
  action,
  dataState,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  dataState: string;
}) {
  return (
    <div
      className="grid gap-3 rounded-2xl bg-pet-cream/70 px-4 py-4"
      data-dashboard-section-state={dataState}
      role={dataState === "error" ? "alert" : undefined}
    >
      <div>
        <p className="text-sm font-bold text-pet-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-pet-muted">{children}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function PanelRetry({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
