"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export type AdminExportFormat = "csv" | "xlsx";

export type AdminExportScope = "filtered" | "selected";

// Optional extra section for listings that also offer an external
// production-facing export (e.g. the Tag Inventory manufacturer file),
// clearly separated from the internal CSV/Excel exports.
export type AdminProductionExport = {
  onExport: (scope: AdminExportScope) => void;
  description: string;
};

// Export dropdown for admin listings. "Filtered" exports everything matching
// the current filters (not just the visible page); "Selected" exports only the
// checked rows.
export function AdminExportMenu({
  onExport,
  selectedCount,
  busy = false,
  formats = ["csv", "xlsx"],
  production,
}: {
  onExport: (format: AdminExportFormat, scope: AdminExportScope) => void;
  selectedCount: number;
  busy?: boolean;
  formats?: AdminExportFormat[];
  production?: AdminProductionExport;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const formatLabels: Record<AdminExportFormat, string> = {
    csv: "CSV",
    xlsx: "Excel",
  };

  function runExport(format: AdminExportFormat, scope: AdminExportScope) {
    setOpen(false);
    onExport(format, scope);
  }

  function runProductionExport(scope: AdminExportScope) {
    setOpen(false);
    production?.onExport(scope);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Icon name="copy" className="h-3.5 w-3.5" />
        {busy ? "Exporting…" : "Export"}
        <Icon name="chevron" className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
          role="menu"
        >
          <p className="px-2 pb-1 pt-1.5 text-[0.65rem] font-extrabold uppercase text-slate-400">
            Filtered results
          </p>
          {formats.map((format) => (
            <button
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              key={`filtered-${format}`}
              onClick={() => runExport(format, "filtered")}
              role="menuitem"
              type="button"
            >
              Export all filtered rows as {formatLabels[format]}
            </button>
          ))}
          <p className="px-2 pb-1 pt-2 text-[0.65rem] font-extrabold uppercase text-slate-400">
            Selected rows
          </p>
          {formats.map((format) => (
            <button
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={selectedCount === 0}
              key={`selected-${format}`}
              onClick={() => runExport(format, "selected")}
              role="menuitem"
              title={selectedCount === 0 ? "Select rows to enable this export." : undefined}
              type="button"
            >
              Export {selectedCount > 0 ? `${selectedCount} selected` : "selected"} as{" "}
              {formatLabels[format]}
            </button>
          ))}
          {production ? (
            <>
              <p className="border-t border-slate-100 px-2 pb-1 pt-2 text-[0.65rem] font-extrabold uppercase text-slate-400">
                Production
              </p>
              <button
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => runProductionExport("filtered")}
                role="menuitem"
                type="button"
              >
                Export filtered rows for manufacturer
              </button>
              <button
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                disabled={selectedCount === 0}
                onClick={() => runProductionExport("selected")}
                role="menuitem"
                title={
                  selectedCount === 0 ? "Select rows to enable this export." : undefined
                }
                type="button"
              >
                Export {selectedCount > 0 ? `${selectedCount} selected` : "selected"}{" "}
                {selectedCount === 1 ? "row" : "rows"} for manufacturer
              </button>
              <p className="px-2 pb-1.5 pt-1 text-xs font-semibold leading-4 text-slate-500">
                {production.description}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
