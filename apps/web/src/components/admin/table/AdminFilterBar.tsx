"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

// Declarative filter toolbar for admin listings: primary filters stay visible
// on desktop, advanced ones sit behind "More filters", and everything moves
// into a collapsible panel on small screens. Active filters render as chips
// that can be cleared one by one or all at once.

export type AdminFilterOption = { value: string; label: string };

export type AdminFilterDef =
  | {
      type: "select";
      key: string;
      label: string;
      options: AdminFilterOption[];
      advanced?: boolean;
    }
  | {
      type: "text";
      key: string;
      label: string;
      placeholder?: string;
      advanced?: boolean;
    }
  | {
      // Writes `${key}From` / `${key}To` URL params (yyyy-mm-dd).
      type: "date-range";
      key: string;
      label: string;
      advanced?: boolean;
    };

export type AdminFilterChip = { key: string; label: string; value: string };

function chipForFilter(
  def: AdminFilterDef,
  filters: Record<string, string>
): AdminFilterChip[] {
  if (def.type === "date-range") {
    const from = filters[`${def.key}From`];
    const to = filters[`${def.key}To`];

    if (!from && !to) {
      return [];
    }

    const value =
      from && to ? `${from} – ${to}` : from ? `from ${from}` : `until ${to}`;
    return [{ key: def.key, label: def.label, value }];
  }

  const raw = filters[def.key];

  if (!raw) {
    return [];
  }

  const value =
    def.type === "select"
      ? def.options.find((option) => option.value === raw)?.label ?? raw
      : raw;

  return [{ key: def.key, label: def.label, value }];
}

const fieldClass =
  "min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400";

function FilterField({
  def,
  filters,
  onFilterChange,
}: {
  def: AdminFilterDef;
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string | null) => void;
}) {
  const id = useId();

  if (def.type === "select") {
    return (
      <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
        {def.label}
        <select
          className={fieldClass}
          id={id}
          onChange={(event) => onFilterChange(def.key, event.target.value || null)}
          value={filters[def.key] ?? ""}
        >
          <option value="">All</option>
          {def.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (def.type === "text") {
    return (
      <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
        {def.label}
        <input
          className={`${fieldClass} w-36`}
          defaultValue={filters[def.key] ?? ""}
          id={id}
          key={filters[def.key] ?? ""}
          onBlur={(event) =>
            onFilterChange(def.key, event.target.value.trim() || null)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onFilterChange(
                def.key,
                (event.target as HTMLInputElement).value.trim() || null
              );
            }
          }}
          placeholder={def.placeholder}
          type="text"
        />
      </label>
    );
  }

  return (
    <fieldset className="grid gap-1">
      <legend className="text-xs font-extrabold uppercase text-slate-500">
        {def.label}
      </legend>
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`${id}-from`}>
          {def.label} from
        </label>
        <input
          className={fieldClass}
          id={`${id}-from`}
          onChange={(event) =>
            onFilterChange(`${def.key}From`, event.target.value || null)
          }
          type="date"
          value={filters[`${def.key}From`] ?? ""}
        />
        <span className="text-xs font-bold text-slate-400">to</span>
        <label className="sr-only" htmlFor={`${id}-to`}>
          {def.label} until
        </label>
        <input
          className={fieldClass}
          id={`${id}-to`}
          onChange={(event) =>
            onFilterChange(`${def.key}To`, event.target.value || null)
          }
          type="date"
          value={filters[`${def.key}To`] ?? ""}
        />
      </div>
    </fieldset>
  );
}

export function AdminFilterBar({
  searchSlot,
  filters,
  values,
  onFilterChange,
  onFiltersChange,
  onClearAll,
  hasActiveFilters,
  endSlot,
}: {
  searchSlot: ReactNode;
  filters: AdminFilterDef[];
  values: Record<string, string>;
  onFilterChange: (key: string, value: string | null) => void;
  onFiltersChange?: (values: Readonly<Record<string, string | null>>) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  endSlot?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = filters.filter((def) => !def.advanced);
  const advanced = filters.filter((def) => def.advanced);
  const chips = filters.flatMap((def) => chipForFilter(def, values));
  const activeCount = chips.length;

  function clearChip(chip: AdminFilterChip) {
    const def = filters.find((item) => item.key === chip.key);

    if (def?.type === "date-range") {
      if (onFiltersChange) {
        onFiltersChange({ [`${chip.key}From`]: null, [`${chip.key}To`]: null });
      } else {
        onFilterChange(`${chip.key}From`, null);
        onFilterChange(`${chip.key}To`, null);
      }
      return;
    }

    onFilterChange(chip.key, null);
  }

  const filterFields = (defs: AdminFilterDef[]) =>
    defs.map((def) => (
      <FilterField
        def={def}
        filters={values}
        key={def.key}
        onFilterChange={onFilterChange}
      />
    ));

  return (
    <div className="grid gap-3 border-b border-slate-200 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">{searchSlot}</div>
        <button
          aria-expanded={mobileOpen}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          type="button"
        >
          <Icon name="settings" className="h-4 w-4" />
          Filters
          {activeCount > 0 ? (
            <span className="rounded-full bg-slate-950 px-1.5 py-0.5 text-[0.65rem] text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
        <div className="hidden flex-wrap items-end gap-3 lg:flex">
          {filterFields(primary)}
          {advanced.length > 0 ? (
            <button
              aria-expanded={moreOpen}
              className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
              onClick={() => setMoreOpen((open) => !open)}
              type="button"
            >
              More filters
              <Icon
                name="chevron"
                className={`h-3.5 w-3.5 transition ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>
          ) : null}
        </div>
        {endSlot ? <div className="ms-auto flex items-end gap-2">{endSlot}</div> : null}
      </div>

      {moreOpen && advanced.length > 0 ? (
        <div className="hidden flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 lg:flex">
          {filterFields(advanced)}
        </div>
      ) : null}

      {mobileOpen ? (
        <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:hidden">
          {filterFields(filters)}
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-xs font-bold text-slate-700"
              key={chip.key}
            >
              {chip.label}: {chip.value}
              <button
                aria-label={`Clear ${chip.label} filter`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                onClick={() => clearChip(chip)}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          {hasActiveFilters ? (
            <button
              className="inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-extrabold text-slate-500 underline-offset-2 transition hover:text-slate-800 hover:underline"
              onClick={onClearAll}
              type="button"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
