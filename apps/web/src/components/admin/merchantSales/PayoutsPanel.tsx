"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { isAbortError } from "@/services/apiClient";
import {
  cancelCommissionPayout,
  downloadCommissionPayoutStatement,
  getCommissionPayout,
  listCommissionPayouts,
  markCommissionPayoutPaid,
  prepareCommissionPayout,
  type CommissionPayout,
  type CommissionPayoutItem,
  type CommissionPayoutPaymentMethod,
  type CommissionPayoutStatus,
  type CommissionPayoutSummary,
} from "@/services/adminCommissionPayoutService";
import {
  listCommissions,
  type AdminSalesCommission,
} from "@/services/adminMerchantBillingService";
import {
  getMerchantSalesError,
  listSalespersons,
  type AdminSalesperson,
} from "@/services/adminMerchantSalesService";
import {
  dateTime,
  fieldClass,
  InlineError,
  money,
  primaryButton,
  secondaryButton,
  shortDate,
  StatusMessage,
} from "./shared";

const pageSize = 25;
const paymentMethods: { value: CommissionPayoutPaymentMethod; label: string }[] = [
  { value: "BankTransfer", label: "Bank transfer" },
  { value: "DuitNow", label: "DuitNow" },
  { value: "Cheque", label: "Cheque" },
  { value: "Cash", label: "Cash" },
  { value: "Other", label: "Other" },
];

export function PayoutsPanel({
  openId,
  onOpen,
  canPrepare,
  canMarkPaid,
}: {
  openId: string | null;
  onOpen: (id: string | null) => void;
  canPrepare: boolean;
  canMarkPaid: boolean;
}) {
  const today = localDateInput(new Date());
  const [salespersons, setSalespersons] = useState<AdminSalesperson[]>([]);
  const [rows, setRows] = useState<CommissionPayoutSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [salespersonId, setSalespersonId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [through, setThrough] = useState(today);
  const [payoutNumber, setPayoutNumber] = useState("");
  const [detail, setDetail] = useState<CommissionPayout | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listCommissionPayouts(
        {
          page,
          pageSize,
          salespersonId: salespersonId || undefined,
          status: status || undefined,
          from: localDayStart(from),
          toExclusive: localDayAfter(through),
          payoutNumber: payoutNumber.trim() || undefined,
        },
        controller.signal
      ),
      listSalespersons({ page: 1, pageSize: 100 }, controller.signal),
    ])
      .then(([payouts, sellers]) => {
        if (controller.signal.aborted) return;
        setRows(payouts.items);
        setTotal(payouts.total);
        setSalespersons(sellers.items);
        setError("");
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setError(getMerchantSalesError(caught, "We couldn’t load commission payouts."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, page, payoutNumber, reloadKey, salespersonId, status, through]);

  useEffect(() => {
    if (!openId) {
      return;
    }
    const controller = new AbortController();
    getCommissionPayout(openId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) {
          setError(getMerchantSalesError(caught, "We couldn’t load that payout."));
        }
      });
    return () => controller.abort();
  }, [openId, reloadKey]);

  return (
    <div className="grid gap-4">
      {message ? <StatusMessage message={message} /> : null}
      <InlineError message={error} />

      {preparing ? (
        <PreparePayout
          salespersons={salespersons}
          onCancel={() => setPreparing(false)}
          onPrepared={(payout) => {
            setPreparing(false);
            setMessage(`${payout.summary.payoutNumber} prepared. No payment has been recorded.`);
            onOpen(payout.summary.id);
            refresh();
          }}
        />
      ) : null}

      {detail?.summary.id === openId ? (
        <PayoutDetail
          canCancel={canPrepare}
          canMarkPaid={canMarkPaid}
          payout={detail}
          onChanged={(changed, notice) => {
            setDetail(changed);
            setMessage(notice);
            setError("");
            refresh();
          }}
          onClose={() => onOpen(null)}
          onError={setError}
        />
      ) : null}

      <AdminSection
        action={
          canPrepare ? (
            <button className={primaryButton} onClick={() => setPreparing(true)} type="button">
              Prepare payout
            </button>
          ) : undefined
        }
        description="Prepared payouts reserve exact commission rows. Money is transferred separately and recorded only after confirmation."
        title="Commission payouts"
      >
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Filter label="Payout number" value={payoutNumber} onChange={(value) => { setPayoutNumber(value); setPage(1); setLoading(true); }} />
          <label className="grid gap-1 text-sm font-bold">Salesperson<select className={fieldClass} value={salespersonId} onChange={(event) => { setSalespersonId(event.target.value); setPage(1); setLoading(true); }}><option value="">All salespersons</option>{salespersons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-bold">Status<select className={fieldClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setLoading(true); }}><option value="">All statuses</option><option value="Prepared">Prepared</option><option value="Paid">Paid</option><option value="Cancelled">Cancelled</option></select></label>
          <Filter label="Period from" type="date" value={from} onChange={(value) => { setFrom(value); setPage(1); setLoading(true); }} />
          <Filter label="Period through" type="date" value={through} onChange={(value) => { setThrough(value); setPage(1); setLoading(true); }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Payout</th><th className="px-4 py-3">Salesperson</th><th className="px-4 py-3">Earned period</th><th className="px-4 py-3 text-right">Prepared amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Prepared</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{row.payoutNumber}</td>
                  <td className="px-4 py-3"><p className="font-bold">{row.salespersonName}</p><p className="text-xs text-slate-500">{row.salespersonCode}</p></td>
                  <td className="px-4 py-3">{periodLabel(row.periodFrom, row.periodToExclusive)}</td>
                  <td className="px-4 py-3 text-right font-black">{money(row.currency, row.preparedAmount)}</td>
                  <td className="px-4 py-3"><PayoutStatusBadge status={row.status} />{row.recoveryExposure > 0 ? <p className="mt-1 text-xs font-bold text-red-700">Recovery {money(row.currency, row.recoveryExposure)}</p> : null}</td>
                  <td className="px-4 py-3">{dateTime(row.preparedAt)}</td>
                  <td className="px-4 py-3">{row.paidAt ? <><p>{paymentMethodLabel(row.paymentMethod)}</p><p className="text-xs text-slate-500">{row.paymentReference}</p></> : "—"}</td>
                  <td className="px-4 py-3"><button className={secondaryButton} onClick={() => onOpen(row.id)} type="button">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? <p className="p-5 text-sm font-semibold text-slate-500">Loading payouts…</p> : null}
          {!loading && rows.length === 0 ? <p className="p-5 text-sm font-semibold text-slate-500">No payouts match these filters.</p> : null}
        </div>
        {!loading && total > 0 ? <Pagination page={page} total={total} onPage={(value) => { setPage(value); setLoading(true); }} /> : null}
      </AdminSection>
    </div>
  );
}

function PreparePayout({ salespersons, onCancel, onPrepared }: {
  salespersons: AdminSalesperson[];
  onCancel: () => void;
  onPrepared: (payout: CommissionPayout) => void;
}) {
  const today = localDateInput(new Date());
  const [salespersonId, setSalespersonId] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [through, setThrough] = useState(today);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminSalesCommission[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Map<string, AdminSalesCommission>>(new Map());
  const [notes, setNotes] = useState("");
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!salespersonId || !from || !through) {
      return;
    }
    const controller = new AbortController();
    listCommissions({
      page,
      pageSize,
      from: localDayStart(from),
      toExclusive: localDayAfter(through),
      salespersonId,
      payableAndUnclaimed: true,
    }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.items);
          setTotal(result.total);
          setError("");
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) setError(getMerchantSalesError(caught, "We couldn’t load payable commissions."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, page, salespersonId, through]);

  const selection = [...selected.values()];
  const hasScope = Boolean(salespersonId && from && through);
  const eligibleRows = hasScope ? rows : [];
  const expectedTotal = roundMoney(selection.reduce((sum, item) => sum + item.commissionAmount, 0));
  const allVisibleSelected = eligibleRows.length > 0 && eligibleRows.every((item) => selected.has(item.id));
  const salesperson = salespersons.find((item) => item.id === salespersonId);

  function resetScope(change: () => void, shouldLoad: boolean) {
    change();
    setPage(1);
    setSelected(new Map());
    setError("");
    setLoading(shouldLoad);
  }

  function toggle(id: string) {
    const row = eligibleRows.find((item) => item.id === id);
    if (!row) return;
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, row);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Map(current);
      if (allVisibleSelected) eligibleRows.forEach((item) => next.delete(item.id));
      else eligibleRows.forEach((item) => next.set(item.id, item));
      return next;
    });
  }

  async function submit() {
    if (!salespersonId || selection.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const payout = await prepareCommissionPayout({
        salesCommissionIds: selection.map((item) => item.id).sort(),
        salespersonId,
        periodFrom: localDayStart(from),
        periodToExclusive: localDayAfter(through),
        expectedTotal,
        idempotencyKey,
        notes: notes.trim() || null,
      });
      onPrepared(payout);
    } catch (caught) {
      setError(getMerchantSalesError(caught, "We couldn’t prepare this payout."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection description="Choose one salesperson and the exact payable, unclaimed commission rows to reserve." title="Prepare commission payout">
      <div className="grid gap-4 p-5">
        <InlineError message={error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-bold">Salesperson<select className={fieldClass} value={salespersonId} onChange={(event) => resetScope(() => setSalespersonId(event.target.value), Boolean(event.target.value && from && through))}><option value="">Choose salesperson</option>{salespersons.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.salespersonCode}</option>)}</select></label>
          <Filter label="Earned from" type="date" value={from} onChange={(value) => resetScope(() => setFrom(value), Boolean(value && salespersonId && through))} />
          <Filter label="Earned through" type="date" value={through} onChange={(value) => resetScope(() => setThrough(value), Boolean(value && salespersonId && from))} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3"><input aria-label="Select all commissions on this page" checked={allVisibleSelected} disabled={eligibleRows.length === 0} onChange={toggleVisible} type="checkbox" /></th><th className="px-4 py-3">Type / channel</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Merchant</th><th className="px-4 py-3">Earned</th><th className="px-4 py-3 text-right">Base</th><th className="px-4 py-3">Rate / bonus</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{eligibleRows.map((row) => <tr key={row.id}><td className="px-4 py-3"><input aria-label={`Select ${row.sourceOrderNumber}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} type="checkbox" /></td><td className="px-4 py-3"><p className="font-bold">{groupLabel(row.commissionType)}</p><p className="text-xs text-slate-500">{row.sourceType === "TagOrder" ? "Direct retail" : "Merchant"}</p></td><td className="px-4 py-3 font-mono text-xs font-bold">{row.sourceOrderNumber}</td><td className="px-4 py-3">{row.merchantName ?? "—"}</td><td className="px-4 py-3">{dateTime(row.calculatedAt)}</td><td className="px-4 py-3 text-right">{money(row.currency, row.commissionBaseAmount)}</td><td className="px-4 py-3">{rateLabel(row)}</td><td className="px-4 py-3 text-right font-black">{money(row.currency, row.commissionAmount)}</td></tr>)}</tbody>
          </table>
          {loading && hasScope ? <p className="p-4 text-sm font-semibold text-slate-500">Loading eligible commissions…</p> : null}
          {!loading && hasScope && eligibleRows.length === 0 ? <p className="p-4 text-sm font-semibold text-slate-500">No payable, unclaimed commissions are available for this period.</p> : null}
          {!salespersonId ? <p className="p-4 text-sm font-semibold text-slate-500">Choose a salesperson to load eligible commissions.</p> : null}
          {salespersonId && !hasScope ? <p className="p-4 text-sm font-semibold text-slate-500">Choose a complete earned period to load eligible commissions.</p> : null}
        </div>
        {hasScope && total > 0 ? <Pagination page={page} total={total} onPage={(value) => { setLoading(true); setPage(value); }} /> : null}

        <div className="grid gap-3 rounded-xl border border-[#cfe3ff] bg-[#f0f7ff] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Review label="Salesperson" value={salesperson ? `${salesperson.name} · ${salesperson.salespersonCode}` : "Not selected"} />
          <Review label="Earned period" value={`${from || "—"} through ${through || "—"}`} />
          <Review label="Selected" value={`${selection.length} commission${selection.length === 1 ? "" : "s"}`} />
          <Review label="Preview total" value={money("MYR", expectedTotal)} />
          {grouped(selection).map(([label, items]) => <Review key={label} label={label} value={`${items.length} · ${money("MYR", roundMoney(items.reduce((sum, item) => sum + item.commissionAmount, 0)))}`} />)}
        </div>
        <p className="text-xs font-semibold text-slate-500">Only the checked commission IDs will be submitted. The server revalidates eligibility, membership, and the authoritative total before reserving them.</p>
        <label className="grid gap-1 text-sm font-bold">Notes — Admin only<textarea className={`${fieldClass} min-h-20 py-3`} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className={secondaryButton} disabled={busy} onClick={onCancel} type="button">Cancel</button><button className={primaryButton} disabled={busy || !salespersonId || selection.length === 0} onClick={() => void submit()} type="button">{busy ? "Preparing…" : "Prepare payout"}</button></div>
      </div>
    </AdminSection>
  );
}

function PayoutDetail({ payout, canCancel, canMarkPaid, onClose, onChanged, onError }: {
  payout: CommissionPayout;
  canCancel: boolean;
  canMarkPaid: boolean;
  onClose: () => void;
  onChanged: (payout: CommissionPayout, notice: string) => void;
  onError: (message: string) => void;
}) {
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<CommissionPayoutPaymentMethod>("BankTransfer");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const summary = payout.summary;

  async function markPaid() {
    if (!reference.trim() || busy) return;
    setBusy(true);
    onError("");
    try {
      const changed = await markCommissionPayoutPaid(summary.id, {
        concurrencyToken: summary.concurrencyToken,
        paymentMethod: method,
        paymentReference: reference.trim(),
      });
      setPaying(false);
      onChanged(changed, `${summary.payoutNumber} marked paid at ${dateTime(changed.summary.paidAt)}.`);
    } catch (caught) {
      onError(getMerchantSalesError(caught, "We couldn’t mark this payout paid."));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    onError("");
    try {
      const changed = await cancelCommissionPayout(summary.id, summary.concurrencyToken, reason.trim());
      setCancelling(false);
      onChanged(changed, `${summary.payoutNumber} cancelled. Its commissions are payable and unclaimed again.`);
    } catch (caught) {
      onError(getMerchantSalesError(caught, "We couldn’t cancel this payout."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection action={<button className={secondaryButton} onClick={onClose} type="button">Close</button>} description={`${summary.salespersonName} · ${periodLabel(summary.periodFrom, summary.periodToExclusive)}`} title={summary.payoutNumber}>
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2"><PayoutStatusBadge status={summary.status} />{summary.status === "Prepared" ? <span className="text-sm font-bold text-amber-800">No payment has been recorded.</span> : null}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Review label="Salesperson" value={`${summary.salespersonName} · ${summary.salespersonCode}`} /><Review label="Prepared amount" value={money(summary.currency, summary.preparedAmount)} /><Review label="Prepared by" value={payout.preparedBy} /><Review label="Prepared at" value={dateTime(summary.preparedAt)} /><Review label="Commission count" value={String(summary.itemCount)} /><Review label="Earned period" value={periodLabel(summary.periodFrom, summary.periodToExclusive)} />{summary.paidAt ? <><Review label="Paid at" value={dateTime(summary.paidAt)} /><Review label="Paid by" value={payout.paidBy ?? "Administrator"} /><Review label="Payment method" value={paymentMethodLabel(payout.paymentMethod)} /><Review label="Payment reference" value={payout.paymentReference ?? "—"} /></> : null}{summary.cancelledAt ? <><Review label="Cancelled at" value={dateTime(summary.cancelledAt)} /><Review label="Cancelled by" value={payout.cancelledBy ?? "Administrator"} /><Review label="Cancellation reason" value={payout.cancellationReason ?? "—"} /></> : null}</div>

        {summary.status === "Paid" && summary.recoveryExposure > 0 ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"><p className="font-black">Recovery required: {money(summary.currency, summary.recoveryExposure)}</p><p className="mt-1 text-sm font-semibold">Paid amount remains {money(summary.currency, summary.preparedAmount)}. Post-payout reversals are tracked separately and are not deducted automatically.</p></div> : null}
        {payout.notes ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><strong>Notes:</strong> {payout.notes}</p> : null}

        {groupedItems(payout.items).map(([label, items]) => <PayoutItemGroup key={label} label={label} items={items} />)}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button className={secondaryButton} disabled={busy} onClick={() => { setBusy(true); void downloadCommissionPayoutStatement(summary.id, summary.payoutNumber).catch((caught) => onError(getMerchantSalesError(caught, "We couldn’t generate the payout statement."))).finally(() => setBusy(false)); }} type="button">Download statement PDF</button>
          {summary.status === "Prepared" && canCancel ? <button className={secondaryButton} disabled={busy} onClick={() => { setReason(""); setCancelling(true); }} type="button">Cancel payout</button> : null}
          {summary.status === "Prepared" && canMarkPaid ? <button className={primaryButton} disabled={busy} onClick={() => { setMethod("BankTransfer"); setReference(""); setPaying(true); }} type="button">Mark paid</button> : null}
        </div>
      </div>

      <ConfirmDialog confirmDisabled={busy || !reference.trim()} confirmLabel={busy ? "Recording…" : "Confirm real payment"} message={`${summary.payoutNumber} · ${summary.salespersonName} · ${money(summary.currency, summary.preparedAmount)} across ${summary.itemCount} commissions. Confirm only after the external real-world payment has completed; this action does not transfer money.`} onCancel={() => setPaying(false)} onConfirm={() => void markPaid()} open={paying} title="Record payout as paid?">
        <div className="grid gap-3"><label className="grid gap-1 text-sm font-bold">Payment method<select className={fieldClass} value={method} onChange={(event) => setMethod(event.target.value as CommissionPayoutPaymentMethod)}>{paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Payment reference<input className={fieldClass} maxLength={200} required value={reference} onChange={(event) => setReference(event.target.value)} /></label></div>
      </ConfirmDialog>
      <ConfirmDialog confirmDisabled={busy || !reason.trim()} confirmLabel={busy ? "Cancelling…" : "Cancel payout"} destructive message="The payout record and exact item history will remain. Its commissions will be released back to Payable so they can be selected for another payout; no financial history is deleted." onCancel={() => setCancelling(false)} onConfirm={() => void cancel()} open={cancelling} title={`Cancel ${summary.payoutNumber}?`}>
        <label className="grid gap-1 text-sm font-bold">Cancellation reason<textarea className={`${fieldClass} min-h-24 py-3`} maxLength={1000} required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </ConfirmDialog>
    </AdminSection>
  );
}

function PayoutItemGroup({ label, items }: { label: string; items: CommissionPayoutItem[] }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><h3 className="font-black text-slate-900">{label}</h3><span className="text-sm font-bold">{items.length} · {money(items[0]?.currency ?? "MYR", roundMoney(items.reduce((sum, item) => sum + item.commissionAmount, 0)))}</span></div><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-y border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Earned</th><th className="px-4 py-3 text-right">Base</th><th className="px-4 py-3">Rate / bonus</th><th className="px-4 py-3 text-right">Commission</th><th className="px-4 py-3">Current state</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id}><td className="px-4 py-3 font-mono text-xs font-bold">{item.sourceOrderNumber}</td><td className="px-4 py-3">{dateTime(item.calculatedAt)}</td><td className="px-4 py-3 text-right">{money(item.currency, item.commissionBaseAmount)}</td><td className="px-4 py-3">{item.commissionPercentage == null ? `${money(item.currency, item.commissionFixedAmount ?? 0)} fixed` : `${item.commissionPercentage}%`}</td><td className="px-4 py-3 text-right font-black">{money(item.currency, item.commissionAmount)}</td><td className="px-4 py-3"><Badge tone={item.requiresRecovery ? "danger" : item.releasedAt ? "soft" : "mint"}>{item.requiresRecovery ? "Recovery required" : item.releasedAt ? "Released after cancellation" : item.currentCommissionStatus}</Badge>{item.requiresRecovery ? <p className="mt-1 text-xs text-red-700">Reversed {dateTime(item.reversedAt)} · {item.reversalReason ?? "Reason not recorded"}</p> : null}{item.releasedAt ? <p className="mt-1 text-xs text-slate-500">{item.releaseReason}</p> : null}</td></tr>)}</tbody></table></div>;
}

function PayoutStatusBadge({ status }: { status: CommissionPayoutStatus }) {
  return <Badge tone={status === "Paid" ? "mint" : status === "Cancelled" ? "danger" : "warm"}>{status === "Prepared" ? "Prepared — Not Yet Paid" : status}</Badge>;
}

function Filter({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="grid gap-1 text-sm font-bold">{label}<input className={fieldClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Review({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[0.68rem] font-extrabold uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-black text-slate-900">{value}</p></div>;
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  return <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 sm:flex-row sm:items-center sm:justify-between"><p>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</p><div className="flex gap-2"><button className={secondaryButton} disabled={page === 1} onClick={() => onPage(page - 1)} type="button">Previous</button><button className={secondaryButton} disabled={page * pageSize >= total} onClick={() => onPage(page + 1)} type="button">Next</button></div></div>;
}

function grouped(items: AdminSalesCommission[]) {
  const map = new Map<string, AdminSalesCommission[]>();
  items.forEach((item) => map.set(groupLabel(item.commissionType), [...(map.get(groupLabel(item.commissionType)) ?? []), item]));
  return [...map.entries()];
}

function groupedItems(items: CommissionPayoutItem[]) {
  const order = ["Direct Retail", "Reseller Acquisition Bonus", "Reseller Repeat", "Legacy Merchant Percentage"];
  const map = new Map<string, CommissionPayoutItem[]>();
  items.forEach((item) => map.set(groupLabel(item.commissionType), [...(map.get(groupLabel(item.commissionType)) ?? []), item]));
  return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

function groupLabel(type: AdminSalesCommission["commissionType"] | CommissionPayoutItem["commissionType"]) {
  if (type === "DirectRetailPercentage") return "Direct Retail";
  if (type === "ResellerAcquisitionBonus") return "Reseller Acquisition Bonus";
  if (type === "ResellerRepeatPercentage") return "Reseller Repeat";
  return "Legacy Merchant Percentage";
}

function rateLabel(item: AdminSalesCommission) {
  return item.commissionPercentage == null ? `${money(item.currency, item.commissionFixedAmount ?? 0)} fixed` : `${item.commissionPercentage}%`;
}

function paymentMethodLabel(value: CommissionPayoutPaymentMethod | null) {
  return paymentMethods.find((item) => item.value === value)?.label ?? "—";
}

function periodLabel(from: string, toExclusive: string) {
  const end = new Date(new Date(toExclusive).getTime() - 1);
  return `${shortDate(from)} – ${shortDate(end.toISOString())}`;
}

function localDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDayStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : "";
}

function localDayAfter(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `payout-ui-${crypto.randomUUID()}`;
  return `payout-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
