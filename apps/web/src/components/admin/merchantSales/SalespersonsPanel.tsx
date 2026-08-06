"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import {
  AdminDataTable,
  type AdminColumn,
} from "@/components/admin/table/AdminDataTable";
import {
  AdminFilterBar,
  type AdminFilterDef,
} from "@/components/admin/table/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import {
  AdminRowActionMenu,
  type AdminRowAction,
} from "@/components/admin/table/AdminRowActionMenu";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isAbortError } from "@/services/apiClient";
import {
  createSalesperson,
  getMerchantSalesError,
  getMerchantSalesFieldErrors,
  isConcurrencyConflict,
  listSalespersons,
  setSalespersonActive,
  updateSalesperson,
  type AdminSalesperson,
} from "@/services/adminMerchantSalesService";
import {
  DetailGrid,
  DetailRow,
  InlineError,
  StatusMessage,
  fieldClass,
  orNotProvided,
  primaryButton,
  secondaryButton,
  shortDate,
} from "./shared";

const filterKeys = ["active"] as const;

const commissionHelp =
  "The default commission percentage is used for new merchant sales and is snapshotted when the order is created.";

export function SalespersonsPanel({
  openId,
  editing,
  onOpen,
  onEdit,
  onCloseEditor,
}: {
  openId: string | null;
  editing: boolean;
  onOpen: (id: string | null) => void;
  onEdit: (id: string | "new" | null) => void;
  onCloseEditor: () => void;
}) {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "createdAt",
  });

  const listParams = useMemo(
    () => ({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      isActive:
        query.filters.active === "active"
          ? true
          : query.filters.active === "inactive"
            ? false
            : undefined,
    }),
    [query]
  );

  const paramsKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [listState, setListState] = useState<{
    key: string;
    items: AdminSalesperson[];
    total: number;
    error: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingActivation, setPendingActivation] = useState<AdminSalesperson | null>(null);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const params = JSON.parse(paramsKey) as typeof listParams;

    listSalespersons(params, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setListState({ key, items: result.items, total: result.total, error: "" });
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setListState({
          key,
          items: [],
          total: 0,
          error: getMerchantSalesError(caught, "We couldn’t load salespersons. Please try again."),
        });
      });

    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  const loading = listState?.key !== fetchKey;
  const items = listState?.key === fetchKey ? listState.items : [];
  const total = listState?.key === fetchKey ? listState.total : 0;
  const listError = listState?.key === fetchKey ? listState.error : "";
  const open = items.find((item) => item.id === openId) ?? null;

  const filterDefs: AdminFilterDef[] = [
    {
      type: "select",
      key: "active",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ];

  const columns: AdminColumn<AdminSalesperson>[] = [
    {
      id: "code",
      header: "Code",
      cell: (row) => (
        <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
          {row.salespersonCode}
        </span>
      ),
    },
    {
      id: "name",
      header: "Name",
      cell: (row) => (
        <span className="break-words font-bold text-slate-900">{row.name}</span>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      cell: (row) => (
        <div className="min-w-40 max-w-64">
          <p className="break-all text-xs text-slate-600">{orNotProvided(row.email)}</p>
          <p className="text-xs text-slate-500">{orNotProvided(row.phone)}</p>
        </div>
      ),
    },
    {
      id: "commission",
      header: "Default commission",
      cell: (row) => (
        <span className="whitespace-nowrap font-bold text-slate-700">
          {row.defaultCommissionPercentage}%
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge tone={row.isActive ? "mint" : "soft"}>{row.isActive ? "Active" : "Inactive"}</Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (row) => {
        const rowActions: AdminRowAction[] = [
          { label: "View", onSelect: () => onOpen(row.id) },
          { label: "Edit", onSelect: () => onEdit(row.id) },
          {
            label: row.isActive ? "Deactivate" : "Activate",
            onSelect: () => setPendingActivation(row),
          },
        ];
        return (
          <AdminRowActionMenu actions={rowActions} label={`Actions for ${row.salespersonCode}`} />
        );
      },
    },
  ];

  return (
    <div className="grid gap-4">
      {message ? <StatusMessage message={message} /> : null}
      <InlineError message={actionError} />

      {editing ? (
        <SalespersonEditor
          onCancel={onCloseEditor}
          onSaved={(saved) => {
            setMessage(`${saved.name} saved.`);
            setActionError("");
            refresh();
            onCloseEditor();
            onOpen(saved.id);
          }}
          salesperson={openId && openId !== "new" ? (open ?? undefined) : undefined}
        />
      ) : null}

      {open && !editing ? (
        <AdminSection
          action={
            <div className="flex gap-2">
              <button className={secondaryButton} onClick={() => onOpen(null)} type="button">
                Close
              </button>
              <button className={primaryButton} onClick={() => onEdit(open.id)} type="button">
                Edit
              </button>
            </div>
          }
          description={open.salespersonCode}
          title={open.name}
        >
          <div className="grid gap-4 p-5">
            <DetailGrid>
              <DetailRow label="Email">{orNotProvided(open.email)}</DetailRow>
              <DetailRow label="Phone">{orNotProvided(open.phone)}</DetailRow>
              <DetailRow label="Default commission">
                {open.defaultCommissionPercentage}%
              </DetailRow>
              <DetailRow label="Status">{open.isActive ? "Active" : "Inactive"}</DetailRow>
              <DetailRow label="Added">{shortDate(open.createdAt)}</DetailRow>
            </DetailGrid>
            <p className="text-sm font-semibold text-slate-500">{commissionHelp}</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">
                Internal notes — Admin only
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {orNotProvided(open.internalNotes)}
              </p>
            </div>
          </div>
        </AdminSection>
      ) : null}

      <AdminSection
        action={
          <button className={primaryButton} onClick={() => onEdit("new")} type="button">
            New salesperson
          </button>
        }
        description="Who sells to merchants, and what they earn on a paid order."
        title="Salespersons"
      >
        <AdminFilterBar
          filters={filterDefs}
          hasActiveFilters={hasActiveFilters}
          onClearAll={actions.clearAllFilters}
          onFilterChange={actions.setFilter}
          onFiltersChange={actions.setFilters}
          searchSlot={
            <AdminSearchInput
              onChange={actions.setSearch}
              placeholder="Search name, code, email…"
              value={query.search}
            />
          }
          values={query.filters}
        />

        <AdminDataTable
          columns={columns}
          emptyDescription={
            hasActiveFilters
              ? "Try changing or clearing the filters above."
              : "Add a salesperson before raising merchant quotations."
          }
          emptyTitle={
            hasActiveFilters ? "No salespersons match these filters." : "No salespersons yet."
          }
          error={listError || undefined}
          loading={loading}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
          onRetry={refresh}
          onRowOpen={(row) => onOpen(row.id)}
          onSortChange={actions.setSort}
          page={query.page}
          pageSize={query.pageSize}
          rowKey={(row) => row.id}
          rowOpenLabel="View"
          rows={items}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          stickyFirstColumn
          total={total}
        />
      </AdminSection>

      <ConfirmDialog
        confirmLabel={pendingActivation?.isActive ? "Deactivate" : "Activate"}
        destructive={pendingActivation?.isActive ?? false}
        message={
          pendingActivation?.isActive
            ? "An inactive salesperson cannot be assigned to a new merchant or quotation. Commission already earned on past orders is unaffected."
            : "This salesperson can be assigned to new merchant sales again."
        }
        onCancel={() => setPendingActivation(null)}
        onConfirm={() => {
          const target = pendingActivation;
          setPendingActivation(null);
          if (!target) return;

          void setSalespersonActive(target.id, !target.isActive, target.concurrencyToken)
            .then(() => {
              setActionError("");
              setMessage(`${target.name} is now ${target.isActive ? "inactive" : "active"}.`);
              refresh();
            })
            .catch((caught) => {
              setMessage("");
              setActionError(
                getMerchantSalesError(caught, "We couldn’t change that salesperson.")
              );
              if (isConcurrencyConflict(caught)) refresh();
            });
        }}
        open={pendingActivation !== null}
        title={pendingActivation?.isActive ? "Deactivate salesperson?" : "Activate salesperson?"}
      />
    </div>
  );
}

function SalespersonEditor({
  salesperson,
  onCancel,
  onSaved,
}: {
  salesperson?: AdminSalesperson;
  onCancel: () => void;
  onSaved: (saved: AdminSalesperson) => void;
}) {
  const [name, setName] = useState(salesperson?.name ?? "");
  const [email, setEmail] = useState(salesperson?.email ?? "");
  const [phone, setPhone] = useState(salesperson?.phone ?? "");
  const [percentage, setPercentage] = useState(
    String(salesperson?.defaultCommissionPercentage ?? 0)
  );
  const [notes, setNotes] = useState(salesperson?.internalNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save() {
    if (saving) return;

    const parsed = Number(percentage);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("");
      setFieldErrors({ defaultCommissionPercentage: "Enter a percentage between 0 and 100." });
      return;
    }

    setSaving(true);
    setError("");
    setFieldErrors({});

    const input = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      defaultCommissionPercentage: parsed,
      internalNotes: notes.trim() || null,
      concurrencyToken: salesperson?.concurrencyToken ?? null,
    };

    try {
      const saved = salesperson
        ? await updateSalesperson(salesperson.id, input)
        : await createSalesperson(input);
      onSaved(saved);
    } catch (caught) {
      setError(getMerchantSalesError(caught, "We couldn’t save this salesperson."));
      setFieldErrors(getMerchantSalesFieldErrors(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSection
      description={commissionHelp}
      title={salesperson ? `Edit ${salesperson.salespersonCode}` : "New salesperson"}
    >
      <div className="grid gap-4 p-5 sm:grid-cols-2" data-testid="salesperson-editor">
        <div className="sm:col-span-2">
          <InlineError message={error} />
        </div>

        <Field
          error={fieldErrors.name}
          label="Name"
          onChange={setName}
          required
          value={name}
        />
        <Field error={fieldErrors.email} label="Email" onChange={setEmail} type="email" value={email} />
        <Field error={fieldErrors.phone} label="Phone" onChange={setPhone} value={phone} />
        <Field
          error={fieldErrors.defaultCommissionPercentage}
          hint="Between 0 and 100."
          label="Default commission %"
          onChange={setPercentage}
          type="number"
          value={percentage}
        />

        <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
          Internal notes — Admin only
          <textarea
            className={`${fieldClass} min-h-24 py-3`}
            maxLength={2000}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </label>

        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={primaryButton}
            data-testid="save-salesperson"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving…" : "Save salesperson"}
          </button>
        </div>
      </div>
    </AdminSection>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  type?: string;
}) {
  // aria-describedby takes a space-separated list of ids, so a label-derived id
  // never resolves once the label has a space in it.
  const fieldId = useId();
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <label className="grid gap-1 text-sm font-bold text-pet-ink">
      {label}
      {required ? " *" : ""}
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={fieldClass}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
      {error ? (
        <span className="text-sm font-bold text-[#a63c2e]" id={`${fieldId}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="text-sm font-semibold text-pet-muted" id={`${fieldId}-hint`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
