"use client";

// Contextual bulk-action bar: only appears while rows are selected, and each
// action explains itself when it cannot run against the current selection.

export type AdminBulkAction = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  // Shown as a tooltip when disabled, e.g. "Only Printed tags can be sent".
  disabledReason?: string;
  tone?: "primary" | "neutral" | "danger";
};

const tones = {
  primary: "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
  neutral: "border-[#2c477f] bg-transparent text-white hover:bg-[#2c477f]",
  danger: "border-[#8c3a3a] bg-transparent text-[#ffc9c9] hover:bg-[#5d2a2a]",
};

export function AdminBulkActionBar({
  selectedCount,
  actions,
  onClearSelection,
  busy = false,
}: {
  selectedCount: number;
  actions: AdminBulkAction[];
  onClearSelection: () => void;
  busy?: boolean;
}) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className="sticky bottom-3 z-10 mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-pet-ink px-4 py-3 text-white shadow-lg"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <p className="text-sm font-black">
        {selectedCount} selected
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {actions.map((action) => (
          <button
            className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              tones[action.tone ?? "neutral"]
            }`}
            disabled={busy || action.disabled}
            key={action.id}
            onClick={action.onClick}
            title={action.disabled ? action.disabledReason : undefined}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
      <button
        className="ms-auto inline-flex min-h-9 items-center rounded-full px-3 text-xs font-extrabold text-[#b7c7e8] transition hover:text-white"
        disabled={busy}
        onClick={onClearSelection}
        type="button"
      >
        Clear selection
      </button>
    </div>
  );
}
