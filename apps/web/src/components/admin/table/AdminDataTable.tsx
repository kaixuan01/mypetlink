"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { ADMIN_PAGE_SIZES, type SortDir } from "./useAdminTableQuery";

// Dense, selectable, sortable data table for the Admin Portal. Handles the
// loading / error / empty states, column visibility, row selection, and
// pagination so listing pages only describe their columns and data.

export type AdminColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  // Server sort field id; present = column is sortable.
  sortId?: string;
  align?: "left" | "right";
  // Column can be hidden from the columns menu.
  hideable?: boolean;
  defaultHidden?: boolean;
  className?: string;
};

type AdminDataTableProps<T> = {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  sortBy?: string;
  sortDir?: SortDir;
  onSortChange?: (sortId: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  onRowOpen?: (row: T) => void;
  rowOpenLabel?: string;
  // Keeps the first data column readable while scrolling horizontally.
  stickyFirstColumn?: boolean;
};

export function AdminDataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  sortBy,
  sortDir,
  onSortChange,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  selectable = false,
  selectedIds,
  onSelectedIdsChange,
  onRowOpen,
  rowOpenLabel = "View details",
  stickyFirstColumn = false,
}: AdminDataTableProps<T>) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => new Set(columns.filter((column) => column.defaultHidden).map((column) => column.id))
  );
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!columnsMenuOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!columnsMenuRef.current?.contains(event.target as Node)) {
        setColumnsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [columnsMenuOpen]);

  const visibleColumns = columns.filter((column) => !hiddenColumns.has(column.id));
  const hideableColumns = columns.filter((column) => column.hideable);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selection = selectedIds ?? new Set<string>();
  const pageRowIds = rows.map(rowKey);
  const allOnPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selection.has(id));

  function toggleColumn(columnId: string) {
    setHiddenColumns((current) => {
      const next = new Set(current);

      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }

      return next;
    });
  }

  function toggleRow(id: string) {
    if (!onSelectedIdsChange) {
      return;
    }

    const next = new Set(selection);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    onSelectedIdsChange(next);
  }

  function togglePage() {
    if (!onSelectedIdsChange) {
      return;
    }

    const next = new Set(selection);

    if (allOnPageSelected) {
      for (const id of pageRowIds) {
        next.delete(id);
      }
    } else {
      for (const id of pageRowIds) {
        next.add(id);
      }
    }

    onSelectedIdsChange(next);
  }

  const stickyCellClass = stickyFirstColumn
    ? "sticky left-0 z-[1] bg-inherit"
    : "";
  const stickyDataCellClass = stickyFirstColumn
    ? `sticky ${selectable ? "left-10" : "left-0"} z-[1] bg-inherit`
    : "";

  const headerFor = (column: AdminColumn<T>, index: number) => {
    const alignClass = column.align === "right" ? "text-right" : "text-left";
    const sticky = index === 0 ? stickyDataCellClass : "";
    const isSorted = column.sortId && column.sortId === sortBy;

    return (
      <th
        aria-sort={
          isSorted ? (sortDir === "asc" ? "ascending" : "descending") : undefined
        }
        className={`whitespace-nowrap px-4 py-3 ${alignClass} ${sticky} ${column.className ?? ""}`}
        key={column.id}
        scope="col"
      >
        {column.sortId && onSortChange ? (
          <button
            className={`inline-flex items-center gap-1 text-xs font-extrabold uppercase transition hover:text-slate-900 ${
              isSorted ? "text-slate-900" : "text-slate-500"
            }`}
            onClick={() => onSortChange(column.sortId!)}
            type="button"
          >
            {column.header}
            <Icon
              name="chevron"
              className={`h-3 w-3 transition ${
                isSorted ? (sortDir === "asc" ? "rotate-180" : "") : "opacity-30"
              }`}
            />
          </button>
        ) : (
          column.header
        )}
      </th>
    );
  };

  let body: ReactNode;

  if (loading) {
    body = (
      <tbody aria-hidden="true" className="divide-y divide-slate-100">
        {Array.from({ length: Math.min(pageSize, 8) }, (_, rowIndex) => (
          <tr className="animate-pulse bg-white" key={rowIndex}>
            {selectable ? (
              <td className={`px-4 py-3.5 ${stickyCellClass}`}>
                <span className="block h-4 w-4 rounded bg-slate-100" />
              </td>
            ) : null}
            {visibleColumns.map((column, columnIndex) => (
              <td
                className={`px-4 py-3.5 ${columnIndex === 0 ? stickyDataCellClass : ""}`}
                key={column.id}
              >
                <span
                  className="block h-4 rounded bg-slate-100"
                  style={{ width: `${((rowIndex + columnIndex) % 3) * 20 + 40}%` }}
                />
              </td>
            ))}
            {onRowOpen ? <td className="px-4 py-3.5" /> : null}
          </tr>
        ))}
      </tbody>
    );
  } else if (error) {
    body = (
      <tbody>
        <tr>
          <td
            className="px-4 py-10 text-center"
            colSpan={visibleColumns.length + (selectable ? 1 : 0) + (onRowOpen ? 1 : 0)}
          >
            <p className="text-sm font-bold text-slate-700" role="alert">{error}</p>
            {onRetry ? (
              <button
                className="mt-3 inline-flex min-h-9 items-center rounded-full border border-slate-950 bg-slate-950 px-4 text-xs font-extrabold text-white transition hover:bg-slate-800"
                onClick={onRetry}
                type="button"
              >
                Try Again
              </button>
            ) : null}
          </td>
        </tr>
      </tbody>
    );
  } else if (rows.length === 0) {
    body = (
      <tbody>
        <tr>
          <td
            className="px-4 py-10 text-center"
            colSpan={visibleColumns.length + (selectable ? 1 : 0) + (onRowOpen ? 1 : 0)}
          >
            <p className="text-sm font-black text-slate-900">{emptyTitle}</p>
            {emptyDescription ? (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {emptyDescription}
              </p>
            ) : null}
          </td>
        </tr>
      </tbody>
    );
  } else {
    body = (
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const id = rowKey(row);
          const selected = selection.has(id);

          return (
            <tr
              className={`bg-white transition ${selected ? "bg-[#f0f7ff]" : "hover:bg-slate-50"}`}
              key={id}
            >
              {selectable ? (
                <td className={`px-4 py-3 ${stickyCellClass}`}>
                  <input
                    aria-label={`Select row ${id}`}
                    checked={selected}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-950"
                    onChange={() => toggleRow(id)}
                    type="checkbox"
                  />
                </td>
              ) : null}
              {visibleColumns.map((column, columnIndex) => (
                <td
                  className={`px-4 py-3 ${column.align === "right" ? "text-right" : ""} ${
                    columnIndex === 0 ? stickyDataCellClass : ""
                  } ${column.className ?? ""}`}
                  key={column.id}
                >
                  {column.cell(row)}
                </td>
              ))}
              {onRowOpen ? (
                <td className="px-4 py-3 text-right">
                  <button
                    className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
                    onClick={() => onRowOpen(row)}
                    type="button"
                  >
                    {rowOpenLabel}
                  </button>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    );
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div>
      {loading ? <p className="sr-only" role="status">Loading records.</p> : null}
      {hideableColumns.length > 0 ? (
        <div className="flex justify-end px-4 pt-3">
          <div className="relative" ref={columnsMenuRef}>
            <button
              aria-expanded={columnsMenuOpen}
              aria-haspopup="menu"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-50"
              onClick={() => setColumnsMenuOpen((open) => !open)}
              type="button"
            >
              <Icon name="more" className="h-3.5 w-3.5" />
              Columns
            </button>
            {columnsMenuOpen ? (
              <div
                className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                role="menu"
              >
                {hideableColumns.map((column) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    key={column.id}
                  >
                    <input
                      checked={!hiddenColumns.has(column.id)}
                      className="h-4 w-4 rounded accent-slate-950"
                      onChange={() => toggleColumn(column.id)}
                      type="checkbox"
                    />
                    {column.header}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr className="bg-slate-50">
              {selectable ? (
                <th className={`w-10 px-4 py-3 ${stickyCellClass}`} scope="col">
                  <input
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-950"
                    disabled={loading || rows.length === 0}
                    onChange={togglePage}
                    type="checkbox"
                  />
                </th>
              ) : null}
              {visibleColumns.map(headerFor)}
              {onRowOpen ? (
                <th className="px-4 py-3" scope="col">
                  <span className="sr-only">Details</span>
                </th>
              ) : null}
            </tr>
          </thead>
          {body}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
        <p className="text-xs font-bold text-slate-500">
          {total === 0
            ? "No records"
            : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
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
    </div>
  );
}
