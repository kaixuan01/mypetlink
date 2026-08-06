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
  createMerchant,
  getMerchantSalesError,
  getMerchantSalesFieldErrors,
  isConcurrencyConflict,
  listMerchants,
  listSalespersons,
  setMerchantActive,
  updateMerchant,
  type AdminMerchant,
  type AdminSalesperson,
  type MerchantAddress,
  type UpsertMerchantInput,
} from "@/services/adminMerchantSalesService";
import {
  DetailGrid,
  DetailRow,
  InlineError,
  StatusMessage,
  addressLines,
  OPTION_PAGE_SIZE,
  fieldClass,
  orNotProvided,
  paymentTermLabel,
  primaryButton,
  secondaryButton,
  shortDate,
} from "./shared";

const filterKeys = ["active", "salespersonId", "state"] as const;

const emptyAddress: MerchantAddress = {
  addressLine1: "",
  addressLine2: null,
  postcode: "",
  city: "",
  state: "",
  country: "Malaysia",
};

type Draft = {
  legalBusinessName: string;
  tradingName: string;
  businessRegistrationNumber: string;
  taxIdentificationNumber: string;
  sstRegistrationNumber: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  billing: MerchantAddress;
  deliverySame: boolean;
  delivery: MerchantAddress;
  assignedSalespersonId: string;
  internalNotes: string;
};

function toDraft(merchant?: AdminMerchant): Draft {
  return {
    legalBusinessName: merchant?.legalBusinessName ?? "",
    tradingName: merchant?.tradingName ?? "",
    businessRegistrationNumber: merchant?.businessRegistrationNumber ?? "",
    taxIdentificationNumber: merchant?.taxIdentificationNumber ?? "",
    sstRegistrationNumber: merchant?.sstRegistrationNumber ?? "",
    contactPerson: merchant?.contactPerson ?? "",
    contactEmail: merchant?.contactEmail ?? "",
    contactPhone: merchant?.contactPhone ?? "",
    billing: merchant?.billingAddress ?? { ...emptyAddress },
    deliverySame: merchant?.deliveryAddressSameAsBilling ?? true,
    delivery: merchant?.deliveryAddress ?? { ...emptyAddress },
    assignedSalespersonId: merchant?.assignedSalespersonId ?? "",
    internalNotes: merchant?.internalNotes ?? "",
  };
}

export function MerchantsPanel({
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
      salespersonId: query.filters.salespersonId || undefined,
      state: query.filters.state || undefined,
    }),
    [query]
  );

  const paramsKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [listState, setListState] = useState<{
    key: string;
    items: AdminMerchant[];
    total: number;
    error: string;
  } | null>(null);
  const [salespersons, setSalespersons] = useState<AdminSalesperson[]>([]);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingActivation, setPendingActivation] = useState<AdminMerchant | null>(null);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const params = JSON.parse(paramsKey) as typeof listParams;

    listMerchants(params, controller.signal)
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
          error: getMerchantSalesError(caught, "We couldn’t load merchants. Please try again."),
        });
      });

    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  // One request for the salesperson options; list rows never fetch their own.
  useEffect(() => {
    let active = true;
    listSalespersons({ page: 1, pageSize: OPTION_PAGE_SIZE })
      .then((result) => {
        if (active) setSalespersons(result.items);
      })
      .catch(() => {
        // The filter and picker fall back to free text if this cannot load.
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

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
    {
      type: "select",
      key: "salespersonId",
      label: "Salesperson",
      options: salespersons.map((person) => ({
        value: person.id,
        label: person.name,
      })),
    },
    { type: "text", key: "state", label: "State" },
  ];

  const columns: AdminColumn<AdminMerchant>[] = [
    {
      id: "merchantCode",
      header: "Code",
      cell: (row) => (
        <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
          {row.merchantCode}
        </span>
      ),
    },
    {
      id: "name",
      header: "Business",
      cell: (row) => (
        <div className="min-w-44 max-w-72">
          <p className="break-words font-bold text-slate-900">{row.legalBusinessName}</p>
          {row.tradingName ? (
            <p className="mt-0.5 break-words text-xs text-slate-500">
              Trading as {row.tradingName}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      cell: (row) => (
        <div className="min-w-40 max-w-64">
          <p className="break-words text-slate-700">{row.contactPerson}</p>
          <p className="mt-0.5 break-all text-xs text-slate-500">{row.contactEmail}</p>
          <p className="text-xs text-slate-500">{row.contactPhone}</p>
        </div>
      ),
    },
    {
      id: "state",
      header: "State",
      cell: (row) => (
        <span className="whitespace-nowrap text-slate-600">{row.billingAddress.state}</span>
      ),
    },
    {
      id: "salesperson",
      header: "Salesperson",
      cell: (row) => (
        <span className="text-slate-600">{orNotProvided(row.assignedSalespersonName)}</span>
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
        return <AdminRowActionMenu actions={rowActions} label={`Actions for ${row.merchantCode}`} />;
      },
    },
  ];

  return (
    <div className="grid gap-4">
      {message ? <StatusMessage message={message} /> : null}
      <InlineError message={actionError} />

      {editing ? (
        <MerchantEditor
          merchant={openId && openId !== "new" ? (open ?? undefined) : undefined}
          onCancel={onCloseEditor}
          onSaved={(saved, note) => {
            setMessage(note);
            setActionError("");
            refresh();
            onCloseEditor();
            onOpen(saved.id);
          }}
          salespersons={salespersons}
        />
      ) : null}

      {open && !editing ? (
        <MerchantDetail
          merchant={open}
          onClose={() => onOpen(null)}
          onEdit={() => onEdit(open.id)}
        />
      ) : null}

      <AdminSection
        action={
          <button className={primaryButton} onClick={() => onEdit("new")} type="button">
            New merchant
          </button>
        }
        description="Business customers who buy Smart Tags in bulk."
        title="Merchants"
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
              placeholder="Search name, code, contact…"
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
              : "Add your first business customer to start selling in bulk."
          }
          emptyTitle={hasActiveFilters ? "No merchants match these filters." : "No merchants yet."}
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
            ? "An inactive merchant cannot be chosen for a new quotation. Their existing quotations and orders stay exactly as they are."
            : "This merchant can be chosen for new quotations again."
        }
        onCancel={() => setPendingActivation(null)}
        onConfirm={() => {
          const target = pendingActivation;
          setPendingActivation(null);
          if (!target) return;

          void setMerchantActive(target.id, !target.isActive, target.concurrencyToken)
            .then(() => {
              setActionError("");
              setMessage(
                `${target.legalBusinessName} is now ${target.isActive ? "inactive" : "active"}.`
              );
              refresh();
            })
            .catch((caught) => {
              setMessage("");
              setActionError(
                getMerchantSalesError(caught, "We couldn’t change that merchant. Please try again.")
              );
              if (isConcurrencyConflict(caught)) refresh();
            });
        }}
        open={pendingActivation !== null}
        title={pendingActivation?.isActive ? "Deactivate merchant?" : "Activate merchant?"}
      />
    </div>
  );
}

// --- Detail ----------------------------------------------------------------

function MerchantDetail({
  merchant,
  onClose,
  onEdit,
}: {
  merchant: AdminMerchant;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <AdminSection
      action={
        <div className="flex gap-2">
          <button className={secondaryButton} onClick={onClose} type="button">
            Close
          </button>
          <button className={primaryButton} onClick={onEdit} type="button">
            Edit
          </button>
        </div>
      }
      description={merchant.merchantCode}
      title={merchant.legalBusinessName}
    >
      <div className="grid gap-4 p-5">
        <DetailGrid>
          <DetailRow label="Trading name">{orNotProvided(merchant.tradingName)}</DetailRow>
          <DetailRow label="Business registration">
            {orNotProvided(merchant.businessRegistrationNumber)}
          </DetailRow>
          <DetailRow label="Tax identification number">
            {orNotProvided(merchant.taxIdentificationNumber)}
          </DetailRow>
          <DetailRow label="SST registration">
            {orNotProvided(merchant.sstRegistrationNumber)}
          </DetailRow>
          <DetailRow label="Contact person">{merchant.contactPerson}</DetailRow>
          <DetailRow label="Email">{merchant.contactEmail}</DetailRow>
          <DetailRow label="Phone">{merchant.contactPhone}</DetailRow>
          <DetailRow label="Salesperson">
            {orNotProvided(merchant.assignedSalespersonName)}
          </DetailRow>
          <DetailRow label="Payment term">{paymentTermLabel(merchant.paymentTerm)}</DetailRow>
          <DetailRow label="Status">{merchant.isActive ? "Active" : "Inactive"}</DetailRow>
          <DetailRow label="Added">{shortDate(merchant.createdAt)}</DetailRow>
        </DetailGrid>

        <div className="grid gap-3 sm:grid-cols-2">
          <AddressCard heading="Billing address" lines={addressLines(merchant.billingAddress)} />
          <AddressCard
            heading={
              merchant.deliveryAddressSameAsBilling
                ? "Delivery address (same as billing)"
                : "Delivery address"
            }
            lines={addressLines(merchant.deliveryAddress)}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">
            Internal notes — Admin only, never shown to the merchant
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {orNotProvided(merchant.internalNotes)}
          </p>
        </div>
      </div>
    </AdminSection>
  );
}

function AddressCard({ heading, lines }: { heading: string; lines: string[] }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 p-4">
      <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">{heading}</p>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Not provided</p>
      ) : (
        lines.map((line) => (
          <p className="break-words text-sm text-slate-700" key={line}>
            {line}
          </p>
        ))
      )}
    </div>
  );
}

// --- Editor ----------------------------------------------------------------

function MerchantEditor({
  merchant,
  salespersons,
  onCancel,
  onSaved,
}: {
  merchant?: AdminMerchant;
  salespersons: AdminSalesperson[];
  onCancel: () => void;
  onSaved: (merchant: AdminMerchant, message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(merchant));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  // An inactive salesperson can stay attached to an existing merchant, but is
  // never offered for a new assignment.
  const selectable = salespersons.filter(
    (person) => person.isActive || person.id === draft.assignedSalespersonId
  );

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    setFieldErrors({});

    const input: UpsertMerchantInput = {
      legalBusinessName: draft.legalBusinessName.trim(),
      tradingName: draft.tradingName.trim() || null,
      businessRegistrationNumber: draft.businessRegistrationNumber.trim() || null,
      taxIdentificationNumber: draft.taxIdentificationNumber.trim() || null,
      sstRegistrationNumber: draft.sstRegistrationNumber.trim() || null,
      contactPerson: draft.contactPerson.trim(),
      contactEmail: draft.contactEmail.trim(),
      contactPhone: draft.contactPhone.trim(),
      billingAddress: draft.billing,
      deliveryAddressSameAsBilling: draft.deliverySame,
      deliveryAddress: draft.deliverySame ? null : draft.delivery,
      assignedSalespersonId: draft.assignedSalespersonId || null,
      internalNotes: draft.internalNotes.trim() || null,
      concurrencyToken: merchant?.concurrencyToken ?? null,
    };

    try {
      const saved = merchant
        ? await updateMerchant(merchant.id, input)
        : await createMerchant(input);
      onSaved(saved, `${saved.legalBusinessName} saved.`);
    } catch (caught) {
      setError(getMerchantSalesError(caught, "We couldn’t save this merchant. Please try again."));
      setFieldErrors(getMerchantSalesFieldErrors(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSection
      description="Business details are snapshotted onto every quotation, order and invoice at the moment each is issued."
      title={merchant ? `Edit ${merchant.merchantCode}` : "New merchant"}
    >
      <div className="grid gap-5 p-5" data-testid="merchant-editor">
        <InlineError message={error} />

        <Fieldset legend="Business">
          <Field
            error={fieldErrors.legalBusinessName}
            label="Registered business name"
            onChange={(value) => set({ legalBusinessName: value })}
            required
            value={draft.legalBusinessName}
          />
          <Field
            label="Trading name"
            onChange={(value) => set({ tradingName: value })}
            value={draft.tradingName}
          />
          <Field
            error={fieldErrors.businessRegistrationNumber}
            label="Business registration number"
            onChange={(value) => set({ businessRegistrationNumber: value })}
            value={draft.businessRegistrationNumber}
          />
          <Field
            hint="Leave empty if the merchant is not registered for tax."
            label="Tax identification number"
            onChange={(value) => set({ taxIdentificationNumber: value })}
            value={draft.taxIdentificationNumber}
          />
          <Field
            label="SST registration number"
            onChange={(value) => set({ sstRegistrationNumber: value })}
            value={draft.sstRegistrationNumber}
          />
        </Fieldset>

        <Fieldset legend="Contact">
          <Field
            error={fieldErrors.contactPerson}
            label="Contact person"
            onChange={(value) => set({ contactPerson: value })}
            required
            value={draft.contactPerson}
          />
          <Field
            error={fieldErrors.contactEmail}
            label="Email"
            onChange={(value) => set({ contactEmail: value })}
            required
            type="email"
            value={draft.contactEmail}
          />
          <Field
            error={fieldErrors.contactPhone}
            label="Phone"
            onChange={(value) => set({ contactPhone: value })}
            required
            value={draft.contactPhone}
          />
        </Fieldset>

        <AddressFields
          fieldErrors={fieldErrors}
          legend="Billing address"
          onChange={(billing) => set({ billing })}
          prefix="billing"
          value={draft.billing}
        />

        <Fieldset legend="Delivery address">
          <label className="flex items-center gap-2 text-sm font-bold text-pet-ink sm:col-span-2">
            <input
              checked={draft.deliverySame}
              onChange={(event) => set({ deliverySame: event.target.checked })}
              type="checkbox"
            />
            Same as billing address
          </label>
        </Fieldset>

        {!draft.deliverySame ? (
          <AddressFields
            fieldErrors={fieldErrors}
            legend="Deliver to"
            onChange={(delivery) => set({ delivery })}
            prefix="delivery"
            value={draft.delivery}
          />
        ) : null}

        <Fieldset legend="Sales">
          <label className="grid gap-1 text-sm font-bold text-pet-ink">
            Assigned salesperson
            <select
              className={fieldClass}
              onChange={(event) => set({ assignedSalespersonId: event.target.value })}
              value={draft.assignedSalespersonId}
            >
              <option value="">No salesperson</option>
              {selectable.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.defaultCommissionPercentage}%)
                  {person.isActive ? "" : " — inactive"}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1 text-sm font-bold text-pet-ink">
            Payment term
            <p className={`${fieldClass} flex items-center bg-slate-100`}>Due on receipt</p>
            <span className="text-sm font-semibold text-pet-muted">
              Merchant sales are prepaid; this is not configurable.
            </span>
          </div>
        </Fieldset>

        <Fieldset legend="Internal">
          <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
            Internal notes — Admin only, never shown to the merchant
            <textarea
              className={`${fieldClass} min-h-24 py-3`}
              maxLength={2000}
              onChange={(event) => set({ internalNotes: event.target.value })}
              value={draft.internalNotes}
            />
          </label>
        </Fieldset>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={primaryButton}
            data-testid="save-merchant"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving…" : "Save merchant"}
          </button>
        </div>
      </div>
    </AdminSection>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-black text-slate-950">{legend}</legend>
      {children}
    </fieldset>
  );
}

function AddressFields({
  legend,
  prefix,
  value,
  onChange,
  fieldErrors,
}: {
  legend: string;
  prefix: string;
  value: MerchantAddress;
  onChange: (next: MerchantAddress) => void;
  fieldErrors: Record<string, string>;
}) {
  const set = (patch: Partial<MerchantAddress>) => onChange({ ...value, ...patch });

  return (
    <Fieldset legend={legend}>
      <div className="sm:col-span-2">
        <Field
          error={fieldErrors[`${prefix}Address.addressLine1`]}
          label="Address line 1"
          onChange={(next) => set({ addressLine1: next })}
          required
          value={value.addressLine1}
        />
      </div>
      <div className="sm:col-span-2">
        <Field
          label="Address line 2"
          onChange={(next) => set({ addressLine2: next || null })}
          value={value.addressLine2 ?? ""}
        />
      </div>
      <Field
        error={fieldErrors[`${prefix}Address.postcode`]}
        label="Postcode"
        maxLength={5}
        onChange={(next) => set({ postcode: next })}
        required
        value={value.postcode}
      />
      <Field
        error={fieldErrors[`${prefix}Address.city`]}
        label="City"
        onChange={(next) => set({ city: next })}
        required
        value={value.city}
      />
      <Field
        error={fieldErrors[`${prefix}Address.state`]}
        label="State"
        onChange={(next) => set({ state: next })}
        required
        value={value.state}
      />
      <Field
        error={fieldErrors[`${prefix}Address.country`]}
        label="Country"
        onChange={(next) => set({ country: next })}
        required
        value={value.country}
      />
    </Fieldset>
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
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  type?: string;
  maxLength?: number;
}) {
  // aria-describedby is a space-separated list of ids, so a label-derived id
  // such as "Registered business name-error" resolves to nothing and the
  // message is never announced. Billing and delivery also share label text, so
  // the id has to be unique per field as well as valid.
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
        maxLength={maxLength}
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
