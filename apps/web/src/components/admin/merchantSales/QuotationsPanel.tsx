"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isAbortError } from "@/services/apiClient";
import {
  getMerchantEmailStatuses,
  sendQuotationEmail,
  type MerchantDocumentEmailStatus,
} from "@/services/adminMerchantBillingService";
import {
  convertQuotation,
  createQuotation,
  getMerchantSalesError,
  getMerchantSalesFieldErrors,
  isConcurrencyConflict,
  listMerchants,
  listQuotations,
  listSalespersons,
  transitionQuotation,
  updateQuotation,
  type AdminMerchant,
  type AdminQuotation,
  type AdminSalesperson,
  type QuotationTransition,
} from "@/services/adminMerchantSalesService";
import {
  listAdminTagCatalogOptions,
  type AdminCatalogOptionProduct,
} from "@/services/tagCatalogService";
import {
  BusinessIdentityBlockedNotice,
  DetailGrid,
  DetailRow,
  DocumentDownloadButton,
  EmailStatusBadge,
  InlineError,
  QuotationStatusBadge,
  StatusMessage,
  addressLines,
  capabilityLabel,
  emailStatusDetail,
  OPTION_PAGE_SIZE,
  fieldClass,
  isBusinessIdentityMessage,
  money,
  orNotProvided,
  primaryButton,
  secondaryButton,
  shortDate,
} from "./shared";

const filterKeys = ["status", "merchantId", "salespersonId", "expired"] as const;

const stockWarning =
  "Inventory is not reserved by this quotation. Availability will be confirmed during fulfilment.";

type EditorLine = {
  key: string;
  productVariantId: string;
  quantity: string;
  wholesaleUnitPrice: string;
  lineDiscount: string;
};

export function QuotationsPanel({
  openId,
  editing,
  onOpen,
  onEdit,
  onCloseEditor,
  onOpenOrder,
}: {
  openId: string | null;
  editing: boolean;
  onOpen: (id: string | null) => void;
  onEdit: (id: string | "new" | null) => void;
  onCloseEditor: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "quotationDate",
  });

  const listParams = useMemo(
    () => ({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      status: query.filters.status || undefined,
      merchantId: query.filters.merchantId || undefined,
      salespersonId: query.filters.salespersonId || undefined,
      fromDate: query.filters.fromDate || undefined,
      toDate: query.filters.toDate || undefined,
      expired:
        query.filters.expired === "expired"
          ? true
          : query.filters.expired === "valid"
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
    items: AdminQuotation[];
    total: number;
    error: string;
  } | null>(null);
  const [emailStatuses, setEmailStatuses] = useState<Record<string, MerchantDocumentEmailStatus>>({});
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [salespersons, setSalespersons] = useState<AdminSalesperson[]>([]);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [identityBlock, setIdentityBlock] = useState("");
  const [pending, setPending] = useState<
    | { kind: "transition"; quotation: AdminQuotation; transition: QuotationTransition }
    | { kind: "convert"; quotation: AdminQuotation }
    | { kind: "email"; quotation: AdminQuotation }
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const params = JSON.parse(paramsKey) as typeof listParams;

    listQuotations(params, controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setListState({ key, items: result.items, total: result.total, error: "" });

        // One request for the whole page's email states, never one per row.
        const statuses = await getMerchantEmailStatuses(
          result.items.map((item) => item.id),
          [],
          controller.signal
        ).catch(() => []);
        if (controller.signal.aborted) return;
        setEmailStatuses(
          Object.fromEntries(statuses.map((status) => [status.relatedId, status]))
        );
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setListState({
          key,
          items: [],
          total: 0,
          error: getMerchantSalesError(caught, "We couldn’t load quotations. Please try again."),
        });
      });

    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listMerchants({ page: 1, pageSize: OPTION_PAGE_SIZE }),
      listSalespersons({ page: 1, pageSize: OPTION_PAGE_SIZE }),
    ])
      .then(([merchantResult, salespersonResult]) => {
        if (!active) return;
        setMerchants(merchantResult.items);
        setSalespersons(salespersonResult.items);
      })
      .catch(() => {
        // Pickers fall back to an empty list; the message below explains.
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
      key: "status",
      label: "Status",
      options: ["Draft", "Sent", "Accepted", "Rejected", "Expired", "Converted", "Cancelled"].map(
        (value) => ({ value, label: value })
      ),
    },
    {
      type: "select",
      key: "merchantId",
      label: "Merchant",
      options: merchants.map((item) => ({ value: item.id, label: item.legalBusinessName })),
    },
    {
      type: "select",
      key: "salespersonId",
      label: "Salesperson",
      options: salespersons.map((item) => ({ value: item.id, label: item.name })),
    },
    {
      type: "select",
      key: "expired",
      label: "Validity",
      options: [
        { value: "valid", label: "Still valid" },
        { value: "expired", label: "Past valid-until" },
      ],
    },
    { type: "date-range", key: "", label: "Quotation date" },
  ];

  async function runTransition(quotation: AdminQuotation, transition: QuotationTransition) {
    setBusy(true);
    setActionError("");
    setIdentityBlock("");
    try {
      await transitionQuotation(quotation.id, transition, quotation.concurrencyToken);
      setMessage(`${quotation.quotationNumber} updated.`);
      refresh();
    } catch (caught) {
      setMessage("");
      const text = getMerchantSalesError(caught, "We couldn’t update that quotation.");
      if (isBusinessIdentityMessage(text)) setIdentityBlock(text);
      else setActionError(text);
      if (isConcurrencyConflict(caught)) refresh();
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<AdminQuotation>[] = [
    {
      id: "number",
      header: "Quotation",
      cell: (row) => (
        <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
          {row.quotationNumber}
        </span>
      ),
    },
    {
      id: "merchant",
      header: "Merchant",
      cell: (row) => (
        <div className="min-w-40 max-w-72">
          <p className="break-words font-bold text-slate-900">{row.merchantLegalName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{orNotProvided(row.salespersonName)}</p>
        </div>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      cell: (row) => (
        <div className="min-w-32">
          <p className="whitespace-nowrap text-slate-700">{shortDate(row.quotationDate)}</p>
          <p className="whitespace-nowrap text-xs text-slate-500">
            Valid to {shortDate(row.validUntil)}
          </p>
        </div>
      ),
    },
    { id: "status", header: "Status", cell: (row) => <QuotationStatusBadge status={row.status} /> },
    {
      id: "email",
      header: "Email",
      cell: (row) => <EmailStatusBadge status={emailStatuses[row.id]} />,
    },
    {
      id: "totals",
      header: "Total",
      cell: (row) => (
        <div className="min-w-32 text-right">
          <p className="whitespace-nowrap text-xs text-slate-500">
            {money(row.currency, row.merchandiseSubtotal)}
          </p>
          <p className="whitespace-nowrap text-xs text-slate-500">
            Delivery {money(row.currency, row.deliveryFee)}
          </p>
          <p className="whitespace-nowrap font-black text-slate-950">
            {money(row.currency, row.grandTotal)}
          </p>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (row) => {
        const rowActions: AdminRowAction[] = [{ label: "View", onSelect: () => onOpen(row.id) }];

        if (row.status === "Draft") {
          rowActions.push(
            { label: "Edit", onSelect: () => onEdit(row.id) },
            {
              label: "Mark sent",
              onSelect: () => setPending({ kind: "transition", quotation: row, transition: "send" }),
            },
            {
              label: "Cancel quotation",
              onSelect: () =>
                setPending({ kind: "transition", quotation: row, transition: "cancel" }),
            }
          );
        }

        if (row.status === "Sent") {
          rowActions.push(
            { label: "Send email", onSelect: () => setPending({ kind: "email", quotation: row }) },
            {
              label: "Accept",
              onSelect: () =>
                setPending({ kind: "transition", quotation: row, transition: "accept" }),
            },
            {
              label: "Reject",
              onSelect: () =>
                setPending({ kind: "transition", quotation: row, transition: "reject" }),
            },
            {
              label: "Mark expired",
              onSelect: () =>
                setPending({ kind: "transition", quotation: row, transition: "expire" }),
            },
            {
              label: "Cancel quotation",
              onSelect: () =>
                setPending({ kind: "transition", quotation: row, transition: "cancel" }),
            }
          );
        }

        if (row.status === "Accepted") {
          rowActions.push({
            label: "Convert to order",
            onSelect: () => setPending({ kind: "convert", quotation: row }),
          });
        }

        if (row.status === "Converted" && row.convertedMerchantOrderId) {
          rowActions.push({
            label: "Open merchant order",
            onSelect: () => onOpenOrder(row.convertedMerchantOrderId!),
          });
        }

        return <AdminRowActionMenu actions={rowActions} label={`Actions for ${row.quotationNumber}`} />;
      },
    },
  ];

  return (
    <div className="grid gap-4">
      {message ? <StatusMessage message={message} /> : null}
      <InlineError message={actionError} />
      {identityBlock ? <BusinessIdentityBlockedNotice message={identityBlock} /> : null}

      {editing ? (
        <QuotationEditor
          merchants={merchants}
          onCancel={onCloseEditor}
          onSaved={(saved) => {
            setMessage(`${saved.quotationNumber} saved as a draft.`);
            setActionError("");
            refresh();
            onCloseEditor();
            onOpen(saved.id);
          }}
          quotation={openId && openId !== "new" ? (open ?? undefined) : undefined}
          salespersons={salespersons}
        />
      ) : null}

      {open && !editing ? (
        <QuotationDetail
          emailStatus={emailStatuses[open.id]}
          onClose={() => onOpen(null)}
          onError={setActionError}
          onOpenOrder={onOpenOrder}
          onSendEmail={() => setPending({ kind: "email", quotation: open })}
          quotation={open}
        />
      ) : null}

      <AdminSection
        action={
          <button className={primaryButton} onClick={() => onEdit("new")} type="button">
            New quotation
          </button>
        }
        description="Priced offers to business customers. Sending one freezes the document a merchant receives."
        title="Quotations"
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
              placeholder="Search quotation number or merchant…"
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
              : "Raise a quotation for a merchant to get started."
          }
          emptyTitle={
            hasActiveFilters ? "No quotations match these filters." : "No quotations yet."
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
        confirmDisabled={busy}
        confirmLabel={
          pending?.kind === "email"
            ? "Send email"
            : pending?.kind === "convert"
              ? "Convert to order"
              : "Confirm"
        }
        message={confirmMessage(pending)}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (!target) return;

          if (target.kind === "transition") {
            void runTransition(target.quotation, target.transition);
            return;
          }

          if (target.kind === "convert") {
            setBusy(true);
            void convertQuotation(target.quotation.id, target.quotation.concurrencyToken)
              .then((result) => {
                setActionError("");
                setMessage(
                  result.alreadyConverted
                    ? `${target.quotation.quotationNumber} was already converted. Opening ${result.order.merchantOrderNumber}.`
                    : `${result.order.merchantOrderNumber} created.`
                );
                refresh();
                onOpenOrder(result.order.id);
              })
              .catch((caught) => {
                setMessage("");
                setActionError(
                  getMerchantSalesError(caught, "We couldn’t convert that quotation.")
                );
                if (isConcurrencyConflict(caught)) refresh();
              })
              .finally(() => setBusy(false));
            return;
          }

          setBusy(true);
          void sendQuotationEmail(target.quotation.id)
            .then((result) => {
              setActionError("");
              setMessage(
                result.alreadyQueued
                  ? `An email for ${target.quotation.quotationNumber} was already queued for ${result.recipientEmail}.`
                  : result.status === "Suppressed"
                    ? `Recorded for ${result.recipientEmail}, but not sent: the Business quotation template is switched off.`
                    : `Queued for ${result.recipientEmail}. Queued is not the same as delivered.`
              );
              refresh();
            })
            .catch((caught) => {
              setMessage("");
              const text = getMerchantSalesError(caught, "We couldn’t queue that email.");
              if (isBusinessIdentityMessage(text)) setIdentityBlock(text);
              else setActionError(text);
            })
            .finally(() => setBusy(false));
        }}
        open={pending !== null}
        title={confirmTitle(pending)}
      />
    </div>
  );
}

function confirmTitle(
  pending:
    | { kind: "transition"; transition: QuotationTransition }
    | { kind: "convert" }
    | { kind: "email" }
    | null
): string {
  if (!pending) return "";
  if (pending.kind === "convert") return "Convert to a merchant order?";
  if (pending.kind === "email") return "Send this quotation by email?";

  switch (pending.transition) {
    case "send":
      return "Mark this quotation as sent?";
    case "accept":
      return "Record the merchant's acceptance?";
    case "reject":
      return "Record the merchant's rejection?";
    case "expire":
      return "Mark this quotation as expired?";
    default:
      return "Cancel this quotation?";
  }
}

function confirmMessage(
  pending:
    | { kind: "transition"; quotation: AdminQuotation; transition: QuotationTransition }
    | { kind: "convert"; quotation: AdminQuotation }
    | { kind: "email"; quotation: AdminQuotation }
    | null
): string {
  if (!pending) return "";

  if (pending.kind === "email") {
    return `The quotation PDF will be attached and addressed to ${pending.quotation.contactEmail}. Queuing an email is not the same as delivering it.`;
  }

  if (pending.kind === "convert") {
    return "A merchant order is created with these exact figures. Inventory is not allocated or reserved by this step.";
  }

  if (pending.transition === "send") {
    return "Sending freezes the seller details on the document and stops any further change to the money on this quotation.";
  }

  return `${pending.quotation.quotationNumber} for ${pending.quotation.merchantLegalName}.`;
}

// --- Detail ----------------------------------------------------------------

function QuotationDetail({
  quotation,
  emailStatus,
  onClose,
  onError,
  onSendEmail,
  onOpenOrder,
}: {
  quotation: AdminQuotation;
  emailStatus: MerchantDocumentEmailStatus | undefined;
  onClose: () => void;
  onError: (message: string) => void;
  onSendEmail: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const issued = quotation.status !== "Draft";

  return (
    <AdminSection
      action={
        <button className={secondaryButton} onClick={onClose} type="button">
          Close
        </button>
      }
      description={`${quotation.merchantLegalName} · ${quotation.merchantCode}`}
      title={quotation.quotationNumber}
    >
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <QuotationStatusBadge status={quotation.status} />
          <EmailStatusBadge status={emailStatus} />
        </div>

        <DetailGrid>
          <DetailRow label="Quotation date">{shortDate(quotation.quotationDate)}</DetailRow>
          <DetailRow label="Valid until">{shortDate(quotation.validUntil)}</DetailRow>
          <DetailRow label="Salesperson">{orNotProvided(quotation.salespersonName)}</DetailRow>
          <DetailRow label="Payment term">Due on receipt</DetailRow>
          <DetailRow label="Contact">{quotation.contactPerson}</DetailRow>
          <DetailRow label="Email">{quotation.contactEmail}</DetailRow>
        </DetailGrid>

        <ItemsTable
          currency={quotation.currency}
          deliveryFee={quotation.deliveryFee}
          discountTotal={quotation.discountTotal}
          grandTotal={quotation.grandTotal}
          items={quotation.items}
          merchandiseSubtotal={quotation.merchandiseSubtotal}
          totalLabel="Quotation total"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <AddressBlock heading="Billing address" lines={addressLines(quotation.billingAddress)} />
          <AddressBlock heading="Delivery address" lines={addressLines(quotation.deliveryAddress)} />
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">
            Notes shown to the merchant
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {orNotProvided(quotation.customerNotes)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">
            Internal notes — Admin only, never on the document or in the email
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {orNotProvided(quotation.internalNotes)}
          </p>
        </div>

        <div className="rounded-xl border border-[#ffe2b8] bg-[#fff8ec] p-4">
          <p className="text-sm font-bold text-[#8a5a12]">{stockWarning}</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">Email</p>
          <p className="mt-1 text-sm text-slate-700">{emailStatusDetail(emailStatus)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {issued ? (
            <>
              <DocumentDownloadButton id={quotation.id} kind="quotation" onError={onError} />
              <button className={secondaryButton} onClick={onSendEmail} type="button">
                {emailStatus ? "Resend quotation email" : "Send quotation email"}
              </button>
            </>
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              The document becomes available once the quotation is marked sent.
            </p>
          )}
          {quotation.convertedMerchantOrderId ? (
            <button
              className={secondaryButton}
              onClick={() => onOpenOrder(quotation.convertedMerchantOrderId!)}
              type="button"
            >
              Open merchant order
            </button>
          ) : null}
        </div>
      </div>
    </AdminSection>
  );
}

export function AddressBlock({ heading, lines }: { heading: string; lines: string[] }) {
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

export function ItemsTable({
  items,
  currency,
  merchandiseSubtotal,
  discountTotal,
  deliveryFee,
  grandTotal,
  totalLabel,
}: {
  items: {
    id: string;
    productName: string;
    skuCode: string;
    optionName: string;
    supportsQr: boolean;
    supportsNfc: boolean;
    quantity: number;
    wholesaleUnitPrice: number;
    lineDiscount: number;
    lineSubtotal: number;
  }[];
  currency: string;
  merchandiseSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  grandTotal: number;
  totalLabel: string;
}) {
  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit price</th>
              <th className="px-3 py-2 text-right">Discount</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">
                  <p className="break-words font-bold text-slate-900">{item.productName}</p>
                  <p className="break-words text-xs text-slate-500">
                    SKU {item.skuCode} · {item.optionName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {capabilityLabel(item.supportsQr, item.supportsNfc)}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{item.quantity}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {money(currency, item.wholesaleUnitPrice)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {item.lineDiscount > 0 ? `− ${money(currency, item.lineDiscount)}` : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-bold">
                  {money(currency, item.lineSubtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-3 ml-auto grid max-w-sm gap-1 text-sm">
        <Total label="Merchandise subtotal" value={money(currency, merchandiseSubtotal)} />
        {discountTotal > 0 ? (
          <Total label="Order discount" value={`− ${money(currency, discountTotal)}`} />
        ) : null}
        <Total
          label="Delivery"
          value={deliveryFee <= 0 ? "Free" : money(currency, deliveryFee)}
        />
        <Total bold label={totalLabel} value={money(currency, grandTotal)} />
      </dl>
    </div>
  );
}

function Total({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={bold ? "font-black text-slate-950" : "text-slate-500"}>{label}</dt>
      <dd className={`whitespace-nowrap ${bold ? "font-black text-slate-950" : "text-slate-700"}`}>
        {value}
      </dd>
    </div>
  );
}

// --- Editor ----------------------------------------------------------------

function QuotationEditor({
  quotation,
  merchants,
  salespersons,
  onCancel,
  onSaved,
}: {
  quotation?: AdminQuotation;
  merchants: AdminMerchant[];
  salespersons: AdminSalesperson[];
  onCancel: () => void;
  onSaved: (saved: AdminQuotation) => void;
}) {
  const [merchantId, setMerchantId] = useState(quotation?.merchantId ?? "");
  const [salespersonId, setSalespersonId] = useState(quotation?.salespersonId ?? "");
  const [validUntil, setValidUntil] = useState(
    quotation?.validUntil ? quotation.validUntil.slice(0, 10) : ""
  );
  const [orderDiscount, setOrderDiscount] = useState(String(quotation?.discountTotal ?? 0));
  const [deliveryFee, setDeliveryFee] = useState(String(quotation?.deliveryFee ?? 0));
  const [customerNotes, setCustomerNotes] = useState(quotation?.customerNotes ?? "");
  const [internalNotes, setInternalNotes] = useState(quotation?.internalNotes ?? "");
  const [lines, setLines] = useState<EditorLine[]>(() =>
    quotation && quotation.items.length > 0
      ? quotation.items.map((item, index) => ({
          key: `${item.id}-${index}`,
          productVariantId: item.productVariantId,
          quantity: String(item.quantity),
          wholesaleUnitPrice: String(item.wholesaleUnitPrice),
          lineDiscount: String(item.lineDiscount),
        }))
      : [newLine()]
  );
  const [catalog, setCatalog] = useState<AdminCatalogOptionProduct[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Financial editing stops the moment a quotation has been sent.
  const locked = Boolean(quotation && quotation.status !== "Draft");

  useEffect(() => {
    let active = true;
    listAdminTagCatalogOptions()
      .then((products) => {
        if (active) setCatalog(products);
      })
      .catch(() => {
        // The picker stays empty; saving will explain what is missing.
      });
    return () => {
      active = false;
    };
  }, []);

  const variants = useMemo(
    () =>
      catalog.flatMap((product) =>
        product.variants.map((variant) => ({
          id: variant.id,
          label: `${product.name} — ${variant.sku} (${variant.displayName})`,
          isActive: variant.isActive,
          retailPrice: variant.basePrice,
          currency: variant.currency,
        }))
      ),
    [catalog]
  );

  const selectableMerchants = merchants.filter(
    (item) => item.isActive || item.id === merchantId
  );
  const selectableSalespersons = salespersons.filter(
    (item) => item.isActive || item.id === salespersonId
  );

  function setLine(key: string, patch: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  }

  async function save() {
    if (saving || locked) return;

    if (!merchantId) {
      setFieldErrors({ merchantId: "Choose the merchant this quotation is for." });
      return;
    }

    const parsedLines = lines.map((line) => ({
      productVariantId: line.productVariantId,
      quantity: Number(line.quantity),
      wholesaleUnitPrice: Number(line.wholesaleUnitPrice),
      lineDiscount: Number(line.lineDiscount || 0),
    }));

    if (parsedLines.length === 0 || parsedLines.some((line) => !line.productVariantId)) {
      setFieldErrors({ items: "Add at least one product line." });
      return;
    }

    const badLine = parsedLines.findIndex(
      (line) =>
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        !Number.isFinite(line.wholesaleUnitPrice) ||
        line.wholesaleUnitPrice < 0 ||
        line.lineDiscount < 0
    );
    if (badLine >= 0) {
      setFieldErrors({
        [`line-${badLine}`]:
          "Quantity must be a whole number of at least 1, and prices and discounts cannot be negative.",
      });
      return;
    }

    setSaving(true);
    setError("");
    setFieldErrors({});

    const input = {
      merchantId,
      salespersonId: salespersonId || null,
      validUntil: validUntil ? new Date(`${validUntil}T00:00:00Z`).toISOString() : null,
      discountTotal: Number(orderDiscount || 0),
      deliveryFee: Number(deliveryFee || 0),
      customerNotes: customerNotes.trim() || null,
      internalNotes: internalNotes.trim() || null,
      items: parsedLines,
      concurrencyToken: quotation?.concurrencyToken ?? null,
    };

    try {
      // The server recalculates every total; whatever it returns is the truth.
      const saved = quotation
        ? await updateQuotation(quotation.id, input)
        : await createQuotation(input);
      onSaved(saved);
    } catch (caught) {
      setError(getMerchantSalesError(caught, "We couldn’t save this quotation."));
      setFieldErrors(toEditorFieldErrors(getMerchantSalesFieldErrors(caught)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSection
      description="Totals are always calculated by the server from the quantities, prices and discounts you enter."
      title={quotation ? `Edit ${quotation.quotationNumber}` : "New quotation"}
    >
      <div className="grid gap-5 p-5" data-testid="quotation-editor">
        <InlineError message={error} />

        {locked ? (
          <div className="rounded-xl border border-[#ffe2b8] bg-[#fff8ec] p-4">
            <p className="text-sm font-bold text-[#8a5a12]">
              This quotation has been sent, so its money can no longer be changed.
            </p>
          </div>
        ) : null}

        <div className="rounded-xl border border-[#ffe2b8] bg-[#fff8ec] p-4">
          <p className="text-sm font-bold text-[#8a5a12]" data-testid="quotation-stock-warning">
            {stockWarning}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold text-pet-ink">
            Merchant *
            <select
              aria-invalid={fieldErrors.merchantId ? true : undefined}
              className={fieldClass}
              disabled={locked}
              onChange={(event) => setMerchantId(event.target.value)}
              value={merchantId}
            >
              <option value="">Choose a merchant</option>
              {selectableMerchants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legalBusinessName}
                  {item.isActive ? "" : " — inactive"}
                </option>
              ))}
            </select>
            {fieldErrors.merchantId ? (
              <span className="text-sm font-bold text-[#a63c2e]">{fieldErrors.merchantId}</span>
            ) : null}
          </label>

          <label className="grid gap-1 text-sm font-bold text-pet-ink">
            Salesperson
            <select
              className={fieldClass}
              disabled={locked}
              onChange={(event) => setSalespersonId(event.target.value)}
              value={salespersonId}
            >
              <option value="">No salesperson</option>
              {selectableSalespersons.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.defaultCommissionPercentage}%)
                  {item.isActive ? "" : " — inactive"}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-bold text-pet-ink">
            Valid until
            <input
              className={fieldClass}
              disabled={locked}
              onChange={(event) => setValidUntil(event.target.value)}
              type="date"
              value={validUntil}
            />
          </label>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-950">Items</h3>
            {!locked ? (
              <button
                className={secondaryButton}
                onClick={() => setLines((current) => [...current, newLine()])}
                type="button"
              >
                Add line
              </button>
            ) : null}
          </div>

          {fieldErrors.items ? (
            <p className="text-sm font-bold text-[#a63c2e]">{fieldErrors.items}</p>
          ) : null}

          {lines.map((line, index) => {
            const variant = variants.find((item) => item.id === line.productVariantId);
            const gross = Number(line.quantity || 0) * Number(line.wholesaleUnitPrice || 0);
            const subtotal = gross - Number(line.lineDiscount || 0);

            return (
              <div
                className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"
                data-testid={`quotation-line-${index}`}
                key={line.key}
              >
                <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
                  Product option
                  <select
                    className={fieldClass}
                    disabled={locked}
                    onChange={(event) =>
                      setLine(line.key, { productVariantId: event.target.value })
                    }
                    value={line.productVariantId}
                  >
                    <option value="">Choose a product option</option>
                    {variants
                      .filter((item) => item.isActive || item.id === line.productVariantId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                  </select>
                </label>

                <NumberField
                  disabled={locked}
                  label="Quantity"
                  onChange={(value) => setLine(line.key, { quantity: value })}
                  value={line.quantity}
                />
                <NumberField
                  disabled={locked}
                  label="Wholesale unit price"
                  onChange={(value) => setLine(line.key, { wholesaleUnitPrice: value })}
                  value={line.wholesaleUnitPrice}
                />
                <NumberField
                  disabled={locked}
                  label="Line discount"
                  onChange={(value) => setLine(line.key, { lineDiscount: value })}
                  value={line.lineDiscount}
                />

                <div className="grid gap-1 text-sm sm:col-span-2">
                  {variant ? (
                    <p className="text-xs font-semibold text-slate-500">
                      Retail reference price {money(variant.currency, variant.retailPrice)} — Admin
                      only, never shown to the merchant.
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    Gross {money("MYR", Number.isFinite(gross) ? gross : 0)} · Line subtotal{" "}
                    {money("MYR", Number.isFinite(subtotal) ? subtotal : 0)} (the server confirms
                    the final figures on save)
                  </p>
                  {fieldErrors[`line-${index}`] ? (
                    <p className="text-sm font-bold text-[#a63c2e]">
                      {fieldErrors[`line-${index}`]}
                    </p>
                  ) : null}
                </div>

                {!locked && lines.length > 1 ? (
                  <div className="sm:col-span-2">
                    <button
                      className={secondaryButton}
                      onClick={() =>
                        setLines((current) => current.filter((item) => item.key !== line.key))
                      }
                      type="button"
                    >
                      Remove line
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <NumberField
              disabled={locked}
              label="Order discount"
              onChange={setOrderDiscount}
              value={orderDiscount}
            />
            {fieldErrors.discountTotal ? (
              <p className="text-sm font-bold text-[#a63c2e]">{fieldErrors.discountTotal}</p>
            ) : null}
          </div>
          <div className="grid gap-1">
            <NumberField
              disabled={locked}
              label="Delivery fee"
              onChange={setDeliveryFee}
              value={deliveryFee}
            />
            {fieldErrors.deliveryFee ? (
              <p className="text-sm font-bold text-[#a63c2e]">{fieldErrors.deliveryFee}</p>
            ) : null}
          </div>
          <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
            Notes shown to the merchant
            <textarea
              className={`${fieldClass} min-h-20 py-3`}
              disabled={locked}
              maxLength={2000}
              onChange={(event) => setCustomerNotes(event.target.value)}
              value={customerNotes}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
            Internal notes — Admin only, never on the document or in the email
            <textarea
              className={`${fieldClass} min-h-20 py-3`}
              maxLength={2000}
              onChange={(event) => setInternalNotes(event.target.value)}
              value={internalNotes}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={primaryButton}
            data-testid="save-quotation"
            disabled={saving || locked}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>
    </AdminSection>
  );
}

/**
 * The server names a bad line as "items[2].lineDiscount"; the editor shows line
 * messages under "line-2". Without this the message is dropped and the operator
 * sees a rejection with nothing highlighted.
 */
function toEditorFieldErrors(fields: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    const line = key.match(/^items\[(\d+)\]/);
    mapped[line ? `line-${line[1]}` : key] = message;
  }
  return mapped;
}

function newLine(): EditorLine {
  return {
    key: `line-${Math.random().toString(36).slice(2)}`,
    productVariantId: "",
    quantity: "1",
    wholesaleUnitPrice: "0",
    lineDiscount: "0",
  };
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold text-pet-ink">
      {label}
      <input
        className={fieldClass}
        disabled={disabled}
        inputMode="decimal"
        min={0}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </label>
  );
}
