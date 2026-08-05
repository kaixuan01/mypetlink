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
  issueInvoice,
  listInvoices,
  type AdminMerchantInvoice,
} from "@/services/adminMerchantBillingService";
import {
  cancelMerchantOrder,
  getMerchantSalesError,
  isConcurrencyConflict,
  listMerchantOrders,
  listMerchants,
  type AdminMerchant,
  type AdminMerchantOrder,
} from "@/services/adminMerchantSalesService";
import { AddressBlock, ItemsTable } from "./QuotationsPanel";
import {
  BusinessIdentityBlockedNotice,
  DetailGrid,
  DetailRow,
  InlineError,
  InvoiceStatusBadge,
  MerchantOrderStatusBadge,
  StatusMessage,
  addressLines,
  OPTION_PAGE_SIZE,
  isBusinessIdentityMessage,
  money,
  orNotProvided,
  paymentTermLabel,
  secondaryButton,
  shortDate,
} from "./shared";

const filterKeys = ["paymentStatus", "merchantId", "salespersonId"] as const;

export function OrdersPanel({
  openId,
  onOpen,
  onOpenInvoice,
  paymentStatus,
}: {
  openId: string | null;
  onOpen: (id: string | null) => void;
  onOpenInvoice: (invoiceId: string) => void;
  paymentStatus: string | null;
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
      // A quick action from the Overview arrives as a plain URL parameter.
      paymentStatus: query.filters.paymentStatus || paymentStatus || undefined,
      merchantId: query.filters.merchantId || undefined,
      salespersonId: query.filters.salespersonId || undefined,
      fromDate: query.filters.fromDate || undefined,
      toDate: query.filters.toDate || undefined,
    }),
    [paymentStatus, query]
  );

  const paramsKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [listState, setListState] = useState<{
    key: string;
    items: AdminMerchantOrder[];
    total: number;
    error: string;
  } | null>(null);
  const [invoicesByOrder, setInvoicesByOrder] = useState<Record<string, AdminMerchantInvoice>>({});
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [identityBlock, setIdentityBlock] = useState("");
  const [pending, setPending] = useState<
    { kind: "issue" | "cancel"; order: AdminMerchantOrder } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const params = JSON.parse(paramsKey) as typeof listParams;

    listMerchantOrders(params, controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setListState({ key, items: result.items, total: result.total, error: "" });

        // One invoice request for the whole page rather than one per row.
        const invoices = await listInvoices(
          { page: 1, pageSize: Math.max(result.items.length, 1) * 2 },
          controller.signal
        ).catch(() => ({ items: [] as AdminMerchantInvoice[], total: 0 }));
        if (controller.signal.aborted) return;

        const wanted = new Set(result.items.map((item) => item.id));
        setInvoicesByOrder(
          Object.fromEntries(
            invoices.items
              .filter((invoice) => wanted.has(invoice.merchantOrderId))
              .map((invoice) => [invoice.merchantOrderId, invoice])
          )
        );
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setListState({
          key,
          items: [],
          total: 0,
          error: getMerchantSalesError(caught, "We couldn’t load merchant orders."),
        });
      });

    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  useEffect(() => {
    let active = true;
    listMerchants({ page: 1, pageSize: OPTION_PAGE_SIZE })
      .then((result) => {
        if (active) setMerchants(result.items);
      })
      .catch(() => {
        // The merchant filter simply offers nothing if this cannot load.
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
      key: "paymentStatus",
      label: "Payment status",
      options: [
        { value: "AwaitingPayment", label: "Awaiting payment" },
        { value: "PaymentConfirmed", label: "Payment confirmed" },
        { value: "Cancelled", label: "Cancelled" },
      ],
    },
    {
      type: "select",
      key: "merchantId",
      label: "Merchant",
      options: merchants.map((item) => ({ value: item.id, label: item.legalBusinessName })),
    },
    { type: "date-range", key: "", label: "Created" },
  ];

  /** What the order is actually waiting for, in words an operator uses. */
  function stageLabel(order: AdminMerchantOrder): string {
    if (order.paymentStatus === "Cancelled") return "Cancelled";
    if (order.paymentStatus === "PaymentConfirmed") return "Ready for inventory allocation";
    return invoicesByOrder[order.id] ? "Awaiting payment" : "Awaiting invoice";
  }

  const columns: AdminColumn<AdminMerchantOrder>[] = [
    {
      id: "number",
      header: "Order",
      cell: (row) => (
        <div className="min-w-40">
          <p className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
            {row.merchantOrderNumber}
          </p>
          {row.sourceQuotationNumber ? (
            <p className="whitespace-nowrap font-mono text-[0.68rem] text-slate-500">
              from {row.sourceQuotationNumber}
            </p>
          ) : null}
        </div>
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
      id: "status",
      header: "Payment",
      cell: (row) => <MerchantOrderStatusBadge status={row.paymentStatus} />,
    },
    {
      id: "stage",
      header: "Stage",
      cell: (row) => (
        <span className="break-words text-xs font-bold text-slate-600">{stageLabel(row)}</span>
      ),
    },
    {
      id: "total",
      header: "Total",
      cell: (row) => (
        <span className="whitespace-nowrap font-black text-slate-950">
          {money(row.currency, row.grandTotal)}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      cell: (row) => (
        <span className="whitespace-nowrap text-slate-600">{shortDate(row.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (row) => {
        const invoice = invoicesByOrder[row.id];
        const rowActions: AdminRowAction[] = [{ label: "View", onSelect: () => onOpen(row.id) }];

        if (row.paymentStatus === "AwaitingPayment" && !invoice) {
          rowActions.push({
            label: "Issue invoice",
            onSelect: () => setPending({ kind: "issue", order: row }),
          });
          rowActions.push({
            label: "Cancel order",
            onSelect: () => setPending({ kind: "cancel", order: row }),
          });
        }

        if (invoice) {
          rowActions.push({ label: "View invoice", onSelect: () => onOpenInvoice(invoice.id) });
        }

        return (
          <AdminRowActionMenu actions={rowActions} label={`Actions for ${row.merchantOrderNumber}`} />
        );
      },
    },
  ];

  return (
    <div className="grid gap-4">
      {message ? <StatusMessage message={message} /> : null}
      <InlineError message={actionError} />
      {identityBlock ? <BusinessIdentityBlockedNotice message={identityBlock} /> : null}

      {open ? (
        <MerchantOrderDetail
          invoice={invoicesByOrder[open.id]}
          onClose={() => onOpen(null)}
          onIssueInvoice={() => setPending({ kind: "issue", order: open })}
          onOpenInvoice={onOpenInvoice}
          order={open}
        />
      ) : null}

      <AdminSection
        description="Confirmed bulk sales. Inventory allocation and shipping are a later phase."
        title="Merchant orders"
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
              placeholder="Search order or quotation number…"
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
              : "Accept a quotation and convert it to create the first merchant order."
          }
          emptyTitle={hasActiveFilters ? "No orders match these filters." : "No merchant orders yet."}
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
        confirmLabel={pending?.kind === "issue" ? "Issue invoice" : "Cancel order"}
        destructive={pending?.kind === "cancel"}
        message={
          pending?.kind === "issue"
            ? `${pending.order.merchantLegalName} · ${pending.order.merchantOrderNumber} · ${money(
                pending.order.currency,
                pending.order.grandTotal
              )} · Due on receipt.\n\nAn issued invoice copies these figures and the seller and merchant details exactly as they stand now, and never changes afterwards. Issuing does not allocate or reserve inventory.`
            : `${pending?.order.merchantOrderNumber ?? ""} will be cancelled. This cannot be undone.`
        }
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (!target) return;

          setBusy(true);
          if (target.kind === "issue") {
            void issueInvoice(target.order.id)
              .then((invoice) => {
                setActionError("");
                setIdentityBlock("");
                setMessage(`${invoice.invoiceNumber} issued for ${invoice.merchantOrderNumber}.`);
                refresh();
                onOpenInvoice(invoice.id);
              })
              .catch((caught) => {
                setMessage("");
                const text = getMerchantSalesError(caught, "We couldn’t issue that invoice.");
                if (isBusinessIdentityMessage(text)) setIdentityBlock(text);
                else setActionError(text);
              })
              .finally(() => setBusy(false));
            return;
          }

          void cancelMerchantOrder(target.order.id, target.order.concurrencyToken)
            .then(() => {
              setActionError("");
              setMessage(`${target.order.merchantOrderNumber} cancelled.`);
              refresh();
            })
            .catch((caught) => {
              setMessage("");
              setActionError(getMerchantSalesError(caught, "We couldn’t cancel that order."));
              if (isConcurrencyConflict(caught)) refresh();
            })
            .finally(() => setBusy(false));
        }}
        open={pending !== null}
        title={pending?.kind === "issue" ? "Issue this invoice?" : "Cancel this merchant order?"}
      />
    </div>
  );
}

function MerchantOrderDetail({
  order,
  invoice,
  onClose,
  onIssueInvoice,
  onOpenInvoice,
}: {
  order: AdminMerchantOrder;
  invoice: AdminMerchantInvoice | undefined;
  onClose: () => void;
  onIssueInvoice: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const paid = order.paymentStatus === "PaymentConfirmed";

  return (
    <AdminSection
      action={
        <button className={secondaryButton} onClick={onClose} type="button">
          Close
        </button>
      }
      description={`${order.merchantLegalName} · ${order.merchantCode}`}
      title={order.merchantOrderNumber}
    >
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <MerchantOrderStatusBadge status={order.paymentStatus} />
          {invoice ? <InvoiceStatusBadge status={invoice.status} /> : null}
        </div>

        <DetailGrid>
          <DetailRow label="Source quotation">
            {orNotProvided(order.sourceQuotationNumber)}
          </DetailRow>
          <DetailRow label="Salesperson">{orNotProvided(order.salespersonName)}</DetailRow>
          <DetailRow label="Payment term">{paymentTermLabel(order.paymentTerm)}</DetailRow>
          <DetailRow label="Created">{shortDate(order.createdAt)}</DetailRow>
          <DetailRow label="Contact">{order.contactPerson}</DetailRow>
          <DetailRow label="Email">{order.contactEmail}</DetailRow>
        </DetailGrid>

        <ItemsTable
          currency={order.currency}
          deliveryFee={order.deliveryFee}
          discountTotal={order.discountTotal}
          grandTotal={order.grandTotal}
          items={order.items}
          merchandiseSubtotal={order.merchandiseSubtotal}
          totalLabel="Order total"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <AddressBlock heading="Billing address" lines={addressLines(order.billingAddress)} />
          <AddressBlock heading="Delivery address" lines={addressLines(order.deliveryAddress)} />
        </div>

        <div
          className={
            paid
              ? "rounded-xl border border-[#bfe6d5] bg-[#eef8f5] p-4"
              : "rounded-xl border border-[#ffe2b8] bg-[#fff8ec] p-4"
          }
          data-testid="order-allocation-state"
        >
          <p className={`text-sm font-bold ${paid ? "text-[#0f8a5f]" : "text-[#8a5a12]"}`}>
            {paid
              ? "Payment confirmed. This order is ready for inventory allocation."
              : "Inventory has not been allocated or reserved for this Merchant Order."}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">Invoice</p>
          {invoice ? (
            <>
              <p className="mt-1 text-sm text-slate-700">
                {invoice.invoiceNumber} · issued {shortDate(invoice.invoiceDate)} · due{" "}
                {shortDate(invoice.dueDate)} · {invoice.status}
              </p>
              <button
                className={`${secondaryButton} mt-3`}
                onClick={() => onOpenInvoice(invoice.id)}
                type="button"
              >
                Open invoice
              </button>
            </>
          ) : order.paymentStatus === "AwaitingPayment" ? (
            <>
              <p className="mt-1 text-sm text-slate-700">No invoice has been issued yet.</p>
              <button className={`${secondaryButton} mt-3`} onClick={onIssueInvoice} type="button">
                Issue invoice
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-700">No invoice has been issued yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">
            Internal notes — Admin only
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {orNotProvided(order.internalNotes)}
          </p>
        </div>
      </div>
    </AdminSection>
  );
}
