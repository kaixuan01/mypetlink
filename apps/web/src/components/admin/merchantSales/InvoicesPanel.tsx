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
  listCommissions,
  listInvoices,
  markCommissionPaid,
  recordPayment,
  sendInvoiceEmail,
  type AdminMerchantInvoice,
  type AdminSalesCommission,
  type MerchantDocumentEmailStatus,
} from "@/services/adminMerchantBillingService";
import {
  getMerchantSalesError,
  getMerchantSalesFieldErrors,
  isConcurrencyConflict,
  listMerchants,
  type AdminMerchant,
} from "@/services/adminMerchantSalesService";
import { ItemsTable } from "./QuotationsPanel";
import {
  DetailGrid,
  DetailRow,
  DocumentDownloadButton,
  EmailStatusBadge,
  InlineError,
  InvoiceStatusBadge,
  StatusMessage,
  dateTime,
  emailStatusDetail,
  OPTION_PAGE_SIZE,
  fieldClass,
  money,
  orNotProvided,
  primaryButton,
  secondaryButton,
  shortDate,
} from "./shared";

const filterKeys = ["status", "merchantId"] as const;

const paymentMethods = [
  { value: "BankTransfer", label: "Bank transfer" },
  { value: "DuitNow", label: "DuitNow" },
  { value: "Cheque", label: "Cheque" },
  { value: "Cash", label: "Cash" },
  { value: "Other", label: "Other" },
];

export function InvoicesPanel({
  openId,
  onOpen,
  onOpenOrder,
  status,
}: {
  openId: string | null;
  onOpen: (id: string | null) => void;
  onOpenOrder: (orderId: string) => void;
  status: string | null;
}) {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "invoiceDate",
  });

  const listParams = useMemo(
    () => ({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      status: query.filters.status || status || undefined,
      merchantId: query.filters.merchantId || undefined,
      fromDate: query.filters.fromDate || undefined,
      toDate: query.filters.toDate || undefined,
    }),
    [query, status]
  );

  const paramsKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [listState, setListState] = useState<{
    key: string;
    items: AdminMerchantInvoice[];
    total: number;
    error: string;
  } | null>(null);
  const [emailStatuses, setEmailStatuses] = useState<
    Record<string, Record<string, MerchantDocumentEmailStatus>>
  >({});
  const [commissions, setCommissions] = useState<Record<string, AdminSalesCommission>>({});
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [paying, setPaying] = useState<AdminMerchantInvoice | null>(null);
  const [pendingEmail, setPendingEmail] = useState<AdminMerchantInvoice | null>(null);
  const [pendingCommission, setPendingCommission] = useState<AdminSalesCommission | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const params = JSON.parse(paramsKey) as typeof listParams;

    listInvoices(params, controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setListState({ key, items: result.items, total: result.total, error: "" });

        const [statuses, commissionResult] = await Promise.all([
          getMerchantEmailStatuses(
            [],
            result.items.map((item) => item.id),
            controller.signal
          ).catch(() => []),
          listCommissions({ page: 1, pageSize: OPTION_PAGE_SIZE }, controller.signal).catch(() => ({
            items: [] as AdminSalesCommission[],
            total: 0,
          })),
        ]);
        if (controller.signal.aborted) return;

        // Two entries per invoice are possible: the invoice email and the
        // payment confirmation.
        const byInvoice: Record<string, Record<string, MerchantDocumentEmailStatus>> = {};
        for (const item of statuses) {
          byInvoice[item.relatedId] = {
            ...(byInvoice[item.relatedId] ?? {}),
            [item.messageType]: item,
          };
        }
        setEmailStatuses(byInvoice);
        setCommissions(
          Object.fromEntries(
            commissionResult.items.map((item) => [item.merchantOrderId, item])
          )
        );
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setListState({
          key,
          items: [],
          total: 0,
          error: getMerchantSalesError(caught, "We couldn’t load invoices."),
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
        // The merchant filter offers nothing if this cannot load.
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
      options: ["Issued", "Paid", "Cancelled"].map((value) => ({ value, label: value })),
    },
    {
      type: "select",
      key: "merchantId",
      label: "Merchant",
      options: merchants.map((item) => ({ value: item.id, label: item.legalBusinessName })),
    },
    { type: "date-range", key: "", label: "Invoice date" },
  ];

  const columns: AdminColumn<AdminMerchantInvoice>[] = [
    {
      id: "number",
      header: "Invoice",
      cell: (row) => (
        <div className="min-w-40">
          <p className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
            {row.invoiceNumber}
          </p>
          <p className="whitespace-nowrap font-mono text-[0.68rem] text-slate-500">
            {row.merchantOrderNumber}
          </p>
        </div>
      ),
    },
    {
      id: "merchant",
      header: "Merchant",
      cell: (row) => (
        <span className="block min-w-40 max-w-72 break-words font-bold text-slate-900">
          {row.merchantLegalName}
        </span>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      cell: (row) => (
        <div className="min-w-28">
          <p className="whitespace-nowrap text-slate-700">{shortDate(row.invoiceDate)}</p>
          <p className="whitespace-nowrap text-xs text-slate-500">
            Due {shortDate(row.dueDate)}
          </p>
        </div>
      ),
    },
    { id: "status", header: "Status", cell: (row) => <InvoiceStatusBadge status={row.status} /> },
    {
      id: "email",
      header: "Invoice email",
      cell: (row) => (
        <EmailStatusBadge status={emailStatuses[row.id]?.MerchantInvoice} />
      ),
    },
    {
      id: "receipt",
      header: "Receipt",
      cell: (row) => (
        <span className="whitespace-nowrap font-mono text-xs text-slate-600">
          {row.receipt ? row.receipt.receiptNumber : "—"}
        </span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      cell: (row) => (
        <span className="whitespace-nowrap font-black text-slate-950">
          {money(row.currency, row.grandTotal)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (row) => {
        const rowActions: AdminRowAction[] = [{ label: "View", onSelect: () => onOpen(row.id) }];

        if (row.status !== "Draft") {
          rowActions.push({ label: "Send invoice email", onSelect: () => setPendingEmail(row) });
        }

        // Payment only belongs on an invoice that can still be paid.
        if (row.status === "Issued") {
          rowActions.push({ label: "Record payment", onSelect: () => setPaying(row) });
        }

        rowActions.push({
          label: "Open merchant order",
          onSelect: () => onOpenOrder(row.merchantOrderId),
        });

        return <AdminRowActionMenu actions={rowActions} label={`Actions for ${row.invoiceNumber}`} />;
      },
    },
  ];

  return (
    <div className="grid gap-4">
      {message ? <StatusMessage message={message} /> : null}
      <InlineError message={actionError} />

      {open ? (
        <InvoiceDetail
          commission={commissions[open.merchantOrderId]}
          emails={emailStatuses[open.id] ?? {}}
          invoice={open}
          onClose={() => onOpen(null)}
          onError={setActionError}
          onMarkCommissionPaid={setPendingCommission}
          onOpenOrder={onOpenOrder}
          onRecordPayment={() => setPaying(open)}
          onSendEmail={() => setPendingEmail(open)}
        />
      ) : null}

      <AdminSection
        description="What each merchant was billed, what they paid, and the receipt that settled it."
        title="Invoices & receipts"
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
              placeholder="Search invoice, order or quotation number…"
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
              : "Issue an invoice from a merchant order to see it here."
          }
          emptyTitle={hasActiveFilters ? "No invoices match these filters." : "No invoices yet."}
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

      {paying ? (
        <RecordPaymentDialog
          invoice={paying}
          onCancel={() => setPaying(null)}
          onRecorded={(note) => {
            setPaying(null);
            setActionError("");
            setMessage(note);
            refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        confirmDisabled={busy}
        confirmLabel="Send email"
        message={
          pendingEmail
            ? `The invoice PDF will be attached and addressed to ${pendingEmail.contactEmail}. Queuing an email is not the same as delivering it.`
            : ""
        }
        onCancel={() => setPendingEmail(null)}
        onConfirm={() => {
          const target = pendingEmail;
          setPendingEmail(null);
          if (!target) return;

          setBusy(true);
          void sendInvoiceEmail(target.id)
            .then((result) => {
              setActionError("");
              setMessage(
                result.alreadyQueued
                  ? `An email for ${target.invoiceNumber} was already queued for ${result.recipientEmail}.`
                  : result.status === "Suppressed"
                    ? `Recorded for ${result.recipientEmail}, but not sent: the Business invoice template is switched off.`
                    : `Queued for ${result.recipientEmail}. Queued is not the same as delivered.`
              );
              refresh();
            })
            .catch((caught) => {
              setMessage("");
              setActionError(getMerchantSalesError(caught, "We couldn’t queue that email."));
            })
            .finally(() => setBusy(false));
        }}
        open={pendingEmail !== null}
        title="Send this invoice by email?"
      />

      <ConfirmDialog
        confirmDisabled={busy}
        confirmLabel="Mark as paid"
        message={
          pendingCommission
            ? `${pendingCommission.salespersonName} · ${money(
                pendingCommission.currency,
                pendingCommission.commissionAmount
              )}. This records that the commission has been settled internally; it does not transfer any money.`
            : ""
        }
        onCancel={() => setPendingCommission(null)}
        onConfirm={() => {
          const target = pendingCommission;
          setPendingCommission(null);
          if (!target) return;

          setBusy(true);
          void markCommissionPaid(target.id, target.concurrencyToken)
            .then(() => {
              setActionError("");
              setMessage(`Commission for ${target.salespersonName} marked paid.`);
              refresh();
            })
            .catch((caught) => {
              setMessage("");
              setActionError(getMerchantSalesError(caught, "We couldn’t update that commission."));
              if (isConcurrencyConflict(caught)) refresh();
            })
            .finally(() => setBusy(false));
        }}
        open={pendingCommission !== null}
        title="Mark this commission as paid?"
      />
    </div>
  );
}

// --- Detail ----------------------------------------------------------------

function InvoiceDetail({
  invoice,
  emails,
  commission,
  onClose,
  onError,
  onSendEmail,
  onRecordPayment,
  onMarkCommissionPaid,
  onOpenOrder,
}: {
  invoice: AdminMerchantInvoice;
  emails: Record<string, MerchantDocumentEmailStatus>;
  commission: AdminSalesCommission | undefined;
  onClose: () => void;
  onError: (message: string) => void;
  onSendEmail: () => void;
  onRecordPayment: () => void;
  onMarkCommissionPaid: (commission: AdminSalesCommission) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  return (
    <AdminSection
      action={
        <button className={secondaryButton} onClick={onClose} type="button">
          Close
        </button>
      }
      description={`${invoice.merchantLegalName} · ${invoice.merchantOrderNumber}`}
      title={invoice.invoiceNumber}
    >
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceStatusBadge status={invoice.status} />
          <EmailStatusBadge status={emails.MerchantInvoice} />
        </div>

        <DetailGrid>
          <DetailRow label="Invoice date">{shortDate(invoice.invoiceDate)}</DetailRow>
          <DetailRow label="Due date">{shortDate(invoice.dueDate)}</DetailRow>
          <DetailRow label="Payment term">Due on receipt</DetailRow>
          <DetailRow label="Source quotation">
            {orNotProvided(invoice.sourceQuotationNumber)}
          </DetailRow>
          <DetailRow label="Contact">{invoice.contactPerson}</DetailRow>
          <DetailRow label="Email">{invoice.contactEmail}</DetailRow>
        </DetailGrid>

        <ItemsTable
          currency={invoice.currency}
          deliveryFee={invoice.deliveryFee}
          discountTotal={invoice.discountTotal}
          grandTotal={invoice.grandTotal}
          items={invoice.items.map((item) => ({ ...item, id: item.id }))}
          merchandiseSubtotal={invoice.merchandiseSubtotal}
          totalLabel={invoice.status === "Paid" ? "Total paid" : "Amount due"}
        />

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">Invoice email</p>
          <p className="mt-1 text-sm text-slate-700">
            {emailStatusDetail(emails.MerchantInvoice)}
          </p>
        </div>

        {invoice.payment ? (
          <div className="rounded-xl border border-slate-200 p-4" data-testid="invoice-payment">
            <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">Payment</p>
            <DetailGrid>
              <DetailRow label="Paid on">{shortDate(invoice.payment.paymentDate)}</DetailRow>
              <DetailRow label="Amount">
                {money(invoice.payment.currency, invoice.payment.amountReceived)}
              </DetailRow>
              <DetailRow label="Method">{invoice.payment.method}</DetailRow>
              <DetailRow label="Transaction reference">
                {orNotProvided(invoice.payment.transactionReference)}
              </DetailRow>
              <DetailRow label="Recorded by">
                {orNotProvided(invoice.payment.recordedBy)}
              </DetailRow>
              <DetailRow label="Recorded at">{dateTime(invoice.payment.recordedAt)}</DetailRow>
            </DetailGrid>
            {invoice.payment.internalNote ? (
              <p className="mt-2 text-xs text-slate-500">
                Internal note — Admin only: {invoice.payment.internalNote}
              </p>
            ) : null}
          </div>
        ) : null}

        {invoice.receipt ? (
          <div className="rounded-xl border border-[#bfe6d5] bg-[#eef8f5] p-4" data-testid="invoice-receipt">
            <p className="text-[0.68rem] font-extrabold uppercase text-[#0f8a5f]">
              Official receipt
            </p>
            <DetailGrid>
              <DetailRow label="Receipt number">{invoice.receipt.receiptNumber}</DetailRow>
              <DetailRow label="Issued">{shortDate(invoice.receipt.issuedAt)}</DetailRow>
              <DetailRow label="Amount paid">
                {money(invoice.receipt.currency, invoice.receipt.amountPaid)}
              </DetailRow>
              <DetailRow label="Payment method">{invoice.receipt.paymentMethod}</DetailRow>
            </DetailGrid>
            <p className="mt-2 text-sm text-slate-700">
              {emailStatusDetail(emails.MerchantPaymentConfirmation)}
            </p>
          </div>
        ) : null}

        {commission ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="invoice-commission">
            <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">
              Commission — Admin only, never on a merchant document or email
            </p>
            <DetailGrid>
              <DetailRow label="Salesperson">{commission.salespersonName}</DetailRow>
              <DetailRow label="Percentage">{commission.commissionPercentage}%</DetailRow>
              <DetailRow label="Base (delivery excluded)">
                {money(commission.currency, commission.commissionBaseAmount)}
              </DetailRow>
              <DetailRow label="Amount">
                {money(commission.currency, commission.commissionAmount)}
              </DetailRow>
              <DetailRow label="Status">{commission.status}</DetailRow>
              <DetailRow label="Calculated">{shortDate(commission.calculatedAt)}</DetailRow>
              {commission.paidAt ? (
                <DetailRow label="Paid">{shortDate(commission.paidAt)}</DetailRow>
              ) : null}
            </DetailGrid>
            {commission.status === "Payable" ? (
              <button
                className={`${secondaryButton} mt-3`}
                data-testid="mark-commission-paid"
                onClick={() => onMarkCommissionPaid(commission)}
                type="button"
              >
                Mark commission as paid
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <DocumentDownloadButton id={invoice.id} kind="invoice" onError={onError} />
          {invoice.receipt ? (
            <DocumentDownloadButton id={invoice.id} kind="receipt" onError={onError} />
          ) : null}
          <button className={secondaryButton} onClick={onSendEmail} type="button">
            {emails.MerchantInvoice ? "Resend invoice email" : "Send invoice email"}
          </button>
          {invoice.status === "Issued" ? (
            <button
              className={primaryButton}
              data-testid="open-record-payment"
              onClick={onRecordPayment}
              type="button"
            >
              Record payment
            </button>
          ) : null}
          <button
            className={secondaryButton}
            onClick={() => onOpenOrder(invoice.merchantOrderId)}
            type="button"
          >
            Open merchant order
          </button>
        </div>
      </div>
    </AdminSection>
  );
}

// --- Record payment --------------------------------------------------------

function RecordPaymentDialog({
  invoice,
  onCancel,
  onRecorded,
}: {
  invoice: AdminMerchantInvoice;
  onCancel: () => void;
  onRecorded: (message: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  // Full payment only, so the exact total is the only amount that can succeed.
  const [amount, setAmount] = useState(invoice.grandTotal.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(today);
  const [method, setMethod] = useState("BankTransfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  function validate(): boolean {
    const parsed = Number(amount);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFieldErrors({ amountReceived: "Enter the amount that was received." });
      return false;
    }
    if (Math.round(parsed * 100) !== parsed * 100) {
      setFieldErrors({ amountReceived: "Enter an amount with at most two decimal places." });
      return false;
    }
    if (parsed !== invoice.grandTotal) {
      setFieldErrors({
        amountReceived:
          parsed < invoice.grandTotal
            ? `This invoice must be settled in full. The outstanding amount is ${money(invoice.currency, invoice.grandTotal)}.`
            : `That is more than the invoice total of ${money(invoice.currency, invoice.grandTotal)}. Record the exact amount due.`,
      });
      return false;
    }

    setFieldErrors({});
    return true;
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const result = await recordPayment(invoice.id, {
        paymentDate: new Date(`${paymentDate}T00:00:00Z`).toISOString(),
        amountReceived: Number(amount),
        method,
        transactionReference: reference.trim() || null,
        internalNote: note.trim() || null,
        paymentProofMediaFileId: null,
        concurrencyToken: invoice.concurrencyToken,
      });

      onRecorded(
        result.alreadyRecorded
          ? `This payment was already recorded. Receipt ${result.receipt.receiptNumber} was issued.`
          : `Payment recorded. ${result.invoice.invoiceNumber} is paid and receipt ${result.receipt.receiptNumber} was issued.` +
              (result.commission
                ? ` Commission of ${money(result.commission.currency, result.commission.commissionAmount)} is payable to ${result.commission.salespersonName}.`
                : "")
      );
    } catch (caught) {
      setError(getMerchantSalesError(caught, "We couldn’t record that payment."));
      setFieldErrors(getMerchantSalesFieldErrors(caught));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminSection
        description={`${invoice.merchantLegalName} · ${invoice.invoiceNumber}`}
        title="Record payment"
      >
        <div className="grid gap-4 p-5" data-testid="record-payment-form">
          <InlineError message={error} />

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-900">
              Invoice total {money(invoice.currency, invoice.grandTotal)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Full payment only, in {invoice.currency}. The amount received must match the invoice
              total exactly.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold text-pet-ink">
              Payment date *
              <input
                className={fieldClass}
                max={today}
                onChange={(event) => setPaymentDate(event.target.value)}
                type="date"
                value={paymentDate}
              />
            </label>

            <label className="grid gap-1 text-sm font-bold text-pet-ink">
              Amount received *
              <input
                aria-describedby={fieldErrors.amountReceived ? "amount-error" : undefined}
                aria-invalid={fieldErrors.amountReceived ? true : undefined}
                className={fieldClass}
                data-testid="payment-amount"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                step="0.01"
                type="number"
                value={amount}
              />
              {fieldErrors.amountReceived ? (
                <span className="text-sm font-bold text-[#a63c2e]" id="amount-error">
                  {fieldErrors.amountReceived}
                </span>
              ) : null}
            </label>

            <label className="grid gap-1 text-sm font-bold text-pet-ink">
              Payment method *
              <select
                className={fieldClass}
                onChange={(event) => setMethod(event.target.value)}
                value={method}
              >
                {paymentMethods.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-bold text-pet-ink">
              Bank or e-wallet transaction ID
              <input
                className={fieldClass}
                onChange={(event) => setReference(event.target.value)}
                value={reference}
              />
              <span className="text-sm font-semibold text-pet-muted">
                Optional. Left empty, the receipt simply omits it.
              </span>
            </label>

            <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
              Payment note — Admin only
              <textarea
                className={`${fieldClass} min-h-20 py-3`}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button className={secondaryButton} disabled={saving} onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className={primaryButton}
              data-testid="submit-payment"
              disabled={saving}
              onClick={() => {
                if (validate()) setConfirming(true);
              }}
              type="button"
            >
              {saving ? "Recording…" : "Record payment"}
            </button>
          </div>
        </div>
      </AdminSection>

      <ConfirmDialog
        confirmDisabled={saving}
        confirmLabel="Record payment"
        message={`${money(invoice.currency, Number(amount || 0))} received on ${shortDate(
          `${paymentDate}T00:00:00Z`
        )}. This marks the invoice paid, confirms the merchant order, and issues the official receipt. It cannot be undone.`}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
        open={confirming}
        title="Record this payment?"
      />
    </>
  );
}
