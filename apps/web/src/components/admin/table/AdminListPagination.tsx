"use client";

import { ADMIN_PAGE_SIZES } from "@/components/admin/table/useAdminTableQuery";

// Shared server-side pagination footer for admin card lists that don't use the
// dense AdminDataTable (e.g. the Tag Products master/detail catalog). Mirrors
// the AdminDataTable footer's controls and styling so pagination looks and
// behaves the same across the Admin Portal.
export function AdminListPagination({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-xs font-bold text-slate-500">
        {total === 0 ? "No records" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            Rows
            <select
              className="min-h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none"
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              value={pageSize}
            >
              {ADMIN_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-center gap-1.5">
          <button
            aria-label="Previous page"
            className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            Previous
          </button>
          <span className="text-xs font-bold text-slate-500">
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          <button
            aria-label="Next page"
            className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
