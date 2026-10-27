"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel } from "@/components/admin/AdminStatus";
import { adminCapabilities as caps, hasCapability } from "@/lib/adminCapabilities";
import { getAdminCapabilities } from "@/services/authService";
import {
  downloadSettlementStatement,
  getSettlement,
  listSettlements,
  recalculateSettlement,
  recordPartnerPayment,
  resolveSettlementAttribution,
  voidPartnerPayment,
  type PartnerPaymentMethod,
  type Settlement,
  type SettlementAttention,
  type SettlementReceipt,
  type SettlementRecovery,
  type SettlementStatus,
  type SettlementSummary,
} from "@/services/adminConsignmentSettlementService";
import { getMerchantSalesError, listSalespersons, type AdminSalesperson } from "@/services/adminMerchantSalesService";
import { dateTime, fieldClass, money, primaryButton, secondaryButton, shortDate } from "../shared";
import { BackLink, Callout, DateField, Pager, SelectField, StatusPill, TextAreaField, TextField, Term, TermGroup, textButton } from "./ui";

// What each partner branch owes MyPetLink for a verified sales period, what has
// arrived, and the sales commission the period carries. Delivered stock is never
// part of a settlement: only verified sales are.

const statusLabels: Record<SettlementStatus, string> = {
  AwaitingPayment: "Awaiting payment",
  PartiallyReceived: "Partly paid",
  Settled: "Settled",
  CreditDue: "Credit owed to partner",
};
const statusTone: Record<SettlementStatus, "warning" | "positive" | "critical"> = {
  AwaitingPayment: "warning",
  PartiallyReceived: "warning",
  Settled: "positive",
  CreditDue: "critical",
};
const methods: { value: PartnerPaymentMethod; label: string }[] = [
  { value: "BankTransfer", label: "Bank transfer" },
  { value: "DuitNow", label: "DuitNow" },
  { value: "Cheque", label: "Cheque" },
  { value: "Cash", label: "Cash" },
  { value: "Other", label: "Other" },
];
const commissionStatusLabels: Record<string, string> = {
  Pending: "Waiting for partner payment",
  Payable: "Ready to pay",
  Paid: "Paid",
  Reversed: "Replaced",
};

const MYR = (amount: number) => money("MYR", amount);
const period = (s: SettlementSummary) => `${shortDate(s.periodStart)} – ${shortDate(new Date(new Date(s.periodEndExclusive).getTime() - 1).toISOString())}`;
const todayInMalaysia = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "");

export function SettlementsView() {
  const access = getAdminCapabilities();
  const canRecord = hasCapability(access, caps.consignmentSettlementsRecordReceipt);
  const canResolve = hasCapability(access, caps.consignmentSettlementsResolve);
  const [page, setPage] = useState(1);
  const [attention, setAttention] = useState<SettlementAttention>("");
  const [status, setStatus] = useState<SettlementStatus | "">("");
  const [rows, setRows] = useState<{ items: SettlementSummary[]; total: number } | null>(null);
  const [selected, setSelected] = useState<Settlement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    listSettlements(page, { attention, status })
      .then((result) => { if (live) { setRows(result); setError(""); } })
      .catch((caught) => { if (live) setError(getMerchantSalesError(caught, "We couldn’t load settlements.")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, attention, status, reloadKey]);

  const open = useCallback((id: string) => {
    setError("");
    getSettlement(id).then(setSelected).catch((caught) => setError(getMerchantSalesError(caught, "We couldn’t open this settlement.")));
  }, []);

  if (selected) {
    return (
      <SettlementDetail
        canRecord={canRecord}
        canResolve={canResolve}
        onBack={() => { setSelected(null); setLoading(true); setReloadKey((key) => key + 1); }}
        onChanged={setSelected}
        settlement={selected}
      />
    );
  }

  return (
    <AdminSection
      description="Each verified sales report becomes a settlement: the partner's agreed commission is deducted and the rest is due to MyPetLink. Sales commission becomes ready to pay only once the partner has paid that period in full."
      title="Settlements"
    >
      <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-2 lg:max-w-2xl">
        <label className="grid gap-1 text-sm font-bold text-slate-700">
          Show
          <select className={fieldClass} onChange={(e) => { setLoading(true); setPage(1); setAttention(e.target.value as SettlementAttention); }} value={attention}>
            <option value="">All settlements</option>
            <option value="outstanding">Waiting for partner payment</option>
            <option value="attribution">Salesperson to confirm</option>
            <option value="recovery">Credit or commission to recover</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold text-slate-700">
          Status
          <select className={fieldClass} onChange={(e) => { setLoading(true); setPage(1); setStatus(e.target.value as SettlementStatus | ""); }} value={status}>
            <option value="">Any status</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {error ? <div className="p-5"><Callout role="alert" tone="critical">{error}</Callout></div> : null}
      {!loading && rows && rows.items.length === 0 ? (
        <div className="p-5">
          <AdminEmptyPanel description="A settlement appears here when a partner's sales report is verified." title="No settlements yet" />
        </div>
      ) : null}
      {rows && rows.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Settlement</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3 text-right">Due to MyPetLink</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sales commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <button className={textButton} onClick={() => open(row.id)} type="button">{row.settlementNumber}</button>
                    <p className="text-xs text-slate-500">{row.merchantName} · {row.branchName}</p>
                  </td>
                  <td className="px-4 py-3">{period(row)}</td>
                  <td className="px-4 py-3 text-right font-bold">{MYR(row.expectedRemittance)}</td>
                  <td className="px-4 py-3 text-right">{MYR(row.receivedAmount)}</td>
                  <td className="px-4 py-3 text-right">{MYR(row.outstanding)}</td>
                  <td className="px-4 py-3"><StatusPill tone={statusTone[row.status]}>{statusLabels[row.status]}</StatusPill></td>
                  <td className="px-4 py-3">
                    {row.attributionStatus === "NeedsResolution" ? (
                      <StatusPill tone="warning">Salesperson to confirm</StatusPill>
                    ) : (
                      <span className="grid text-xs">
                        <span className="font-bold text-slate-800">{row.salespersonName ?? "No salesperson"}</span>
                        {row.commissionPending > 0 ? <span>{MYR(row.commissionPending)} waiting</span> : null}
                        {row.commissionPayable > 0 ? <span>{MYR(row.commissionPayable)} ready to pay</span> : null}
                        {row.commissionPaid > 0 ? <span>{MYR(row.commissionPaid)} paid</span> : null}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {rows && rows.total > 20 ? (
        <div className="border-t border-slate-200 p-4">
          <Pager noun="settlement" onPage={(next) => { setLoading(true); setPage(next); }} page={page} pageSize={20} total={rows.total} />
        </div>
      ) : null}
    </AdminSection>
  );
}

function SettlementDetail({
  settlement,
  canRecord,
  canResolve,
  onChanged,
  onBack,
}: {
  settlement: Settlement;
  canRecord: boolean;
  canResolve: boolean;
  onChanged: (next: Settlement) => void;
  onBack: () => void;
}) {
  const s = settlement.summary;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const rates = useMemo(() => [...new Set(settlement.lines.map((line) => line.merchantCommissionPercentage))], [settlement.lines]);
  const run = async (work: () => Promise<Settlement>, done: string, failure: string) => {
    setBusy(true); setError(""); setNotice("");
    try { onChanged(await work()); setNotice(done); return true; }
    catch (caught) { setError(getMerchantSalesError(caught, failure)); return false; }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5">
      <BackLink label="All settlements" onClick={onBack} />
      <AdminSection
        action={
          <button className={secondaryButton} disabled={busy} onClick={() => downloadSettlementStatement(s).catch((caught) => setError(getMerchantSalesError(caught, "We couldn’t download the statement.")))} type="button">
            Download statement
          </button>
        }
        description={`${s.merchantName} · ${s.branchName} · ${period(s)} · Agreement ${settlement.agreementReference} v${settlement.agreementVersion} · Sales report version ${s.salesReportVersion}`}
        title={`Settlement ${s.settlementNumber}`}
      >
        <div className="grid gap-4 p-5">
          {notice ? <Callout role="status">{notice}</Callout> : null}
          {error ? <Callout role="alert" tone="critical">{error}</Callout> : null}
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={statusTone[s.status]}>{statusLabels[s.status]}</StatusPill>
            {s.revision > 1 ? <span className="text-xs font-bold text-slate-500">Recalculated {s.revision - 1} time{s.revision > 2 ? "s" : ""}</span> : null}
          </div>
          {s.status === "CreditDue" ? (
            <Callout tone="warning" title="MyPetLink owes this partner">
              {MYR(s.creditDue)} is owed to the partner, because refunds or a corrected report lowered what was due below what they paid. Settle it with the partner directly and keep the reference.
            </Callout>
          ) : null}
          <TermGroup title="Statement">
            <Term label="Standard price sales">{s.standardQuantity} tags · {MYR(s.standardSales)}</Term>
            <Term label="Promotion sales">{s.promotionQuantity} tags · {MYR(s.promotionSales)}</Term>
            <Term label="Refunds">{s.refundQuantity === 0 ? "None" : `${s.refundQuantity} tags · −${MYR(s.refundAmount)}`}</Term>
            <Term label="Eligible customer sales">{MYR(s.eligibleSales)}</Term>
            <Term label={`Partner commission (${rates.map((r) => `${r}%`).join(", ") || "agreed rate"})`}>−{MYR(s.merchantCommission)}</Term>
            <Term label="Due to MyPetLink">{MYR(s.expectedRemittance)}</Term>
            <Term label="Received">{MYR(s.receivedAmount)}</Term>
            <Term label="Outstanding">{MYR(s.outstanding)}</Term>
          </TermGroup>
          <p className="text-xs text-slate-500">The partner&apos;s commission is calculated once on each rate&apos;s total, never per tag.</p>
        </div>
      </AdminSection>

      <CommissionSection busy={busy} canResolve={canResolve} run={run} settlement={settlement} />

      <AdminSection
        description="Commission rows for this period. A correction replaces unpaid rows; paid rows are never changed."
        title="Commission rows"
      >
        {settlement.commissions.length === 0 ? (
          <p className="p-5 text-sm font-semibold text-slate-500">No commission rows for this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Salesperson</th><th className="px-4 py-3">Price</th><th className="px-4 py-3 text-right">Tags</th><th className="px-4 py-3 text-right">Per tag</th><th className="px-4 py-3 text-right">Commission</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payout</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlement.commissions.map((row) => (
                  <tr className={row.status === "Reversed" ? "text-slate-400" : ""} key={row.id}>
                    <td className="px-4 py-3">{row.salespersonName}</td>
                    <td className="px-4 py-3">{row.commissionType === "ConsignmentStandardPerUnit" ? "Standard" : "Promotion"}</td>
                    <td className="px-4 py-3 text-right">{row.qualifiedQuantity}</td>
                    <td className="px-4 py-3 text-right">{MYR(row.unitAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold">{MYR(row.commissionAmount)}</td>
                    <td className="px-4 py-3">
                      {commissionStatusLabels[row.status] ?? row.status}
                      {row.reversalReason ? <p className="text-xs">{row.reversalReason}</p> : null}
                    </td>
                    <td className="px-4 py-3">{row.payoutNumber ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <PaymentsSection busy={busy} canRecord={canRecord} run={run} settlement={settlement} />

      <AdminSection description="Each verified report version and recalculation is kept as it was. Figures on earlier lines are history, not extra amounts owed: what is owed now is under Sales commission." title="History">
        <ol className="grid gap-2 p-5 text-sm">
          {settlement.revisions.map((revision) => (
            <li className="rounded-xl bg-slate-50 px-3 py-2" key={revision.revision}>
              <p className="font-bold text-slate-900">{revision.reason}</p>
              <p className="text-xs text-slate-500">
                {dateTime(revision.createdAt)} · Due {MYR(revision.expectedRemittance)} · Sales commission {MYR(revision.salesCommissionTarget)}
                {revision.commissionRecoveryRequired > 0 ? ` · Already-paid commission this version no longer earns: ${MYR(revision.commissionRecoveryRequired)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </AdminSection>
    </div>
  );
}

function RecoveryList({ rows }: { rows: SettlementRecovery[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-1">
      {rows.map((row) => (
        // Keyed by the stored obligation: Standard and Promotion recoveries can share every reference shown here.
        <li className="text-xs font-semibold" key={row.recoveryId}>
          {MYR(row.amount)} · {row.quantity} × {MYR(row.unitAmount)} · {row.salespersonName} · paid for {row.originSettlementNumber} ({shortDate(row.originPeriodStart)})
          {row.payoutNumber ? ` in ${row.payoutNumber}` : ""} · taken away by {row.causedBySettlementNumber} ({shortDate(row.causedByPeriodStart)})
        </li>
      ))}
    </ul>
  );
}

type Runner = (work: () => Promise<Settlement>, done: string, failure: string) => Promise<boolean>;

function CommissionSection({ settlement, canResolve, busy, run }: { settlement: Settlement; canResolve: boolean; busy: boolean; run: Runner }) {
  const s = settlement.summary;
  const [salespeople, setSalespeople] = useState<AdminSalesperson[]>([]);
  const [chosen, setChosen] = useState("");
  const [reason, setReason] = useState("");
  const [recalcReason, setRecalcReason] = useState("");
  const needsResolution = s.attributionStatus === "NeedsResolution";
  const recoveries = settlement.currentRecoveries ?? [];
  const earnedHereRecoveredElsewhere = recoveries.filter((row) => row.originSettlementId === s.id && row.causedBySettlementId !== s.id);

  useEffect(() => {
    if (!needsResolution || !canResolve) return;
    listSalespersons({ page: 1, pageSize: 100 }).then((result) => setSalespeople(result.items)).catch(() => setSalespeople([]));
  }, [needsResolution, canResolve]);

  return (
    <AdminSection
      description="Earned on verified sold tags at the Standard or Promotion rate. It waits until the partner has paid this period in full."
      title="Sales commission"
    >
      <div className="grid gap-4 p-5">
        <TermGroup title="Who earns it">
          <Term label="Salesperson">{needsResolution ? "To be confirmed" : s.salespersonName ?? "Nobody"}</Term>
          <Term label="Commission terms">{s.commissionPolicyCode ?? "No terms that pay consignment commission"}</Term>
          <Term label="Decided by">{s.attributionSource === "OperatorResolution" ? "An administrator" : s.attributionSource === "ServicingAssignment" ? "The partner's servicing salesperson for the whole period" : "—"}</Term>
          {settlement.attributionResolutionReason ? <Term label="Reason" wide>{settlement.attributionResolutionReason}</Term> : null}
        </TermGroup>
        <TermGroup title="Amounts">
          <Term label="Waiting for partner payment">{MYR(s.commissionPending)}</Term>
          <Term label="Ready to pay">{MYR(s.commissionPayable)}</Term>
          <Term label="Paid">{MYR(s.commissionPaid)}</Term>
        </TermGroup>
        {s.commissionNote ? <Callout>{s.commissionNote}</Callout> : null}
        {s.commissionRecoveryRequired > 0 ? (
          <Callout tone="warning" title="Commission to recover because of this report">
            {`${MYR(s.commissionRecoveryRequired)} of commission was already paid for tags that this report’s corrections or refunds took away. It is shown on the salesperson’s paid payout too. It isn’t deducted automatically: agree the recovery with the salesperson and keep the reference.`}
            <RecoveryList rows={recoveries.filter((row) => row.causedBySettlementId === s.id)} />
          </Callout>
        ) : null}
        {earnedHereRecoveredElsewhere.length > 0 ? (
          <Callout title="Recovery counted on another report">
            Commission paid for this period was later taken away by another report. That recovery is owed once, on the report below, and is not an extra amount for this period.
            <RecoveryList rows={earnedHereRecoveredElsewhere} />
          </Callout>
        ) : null}
        {needsResolution ? (
          <Callout tone="warning" title="Confirm who earns this period">{s.attributionIssue}</Callout>
        ) : null}
        {needsResolution && canResolve ? (
          <form
            className="grid gap-3 rounded-xl border border-slate-200 p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run(() => resolveSettlementAttribution(s, chosen || null, reason.trim()), "Salesperson confirmed.", "We couldn’t confirm the salesperson.")) setReason("");
            }}
          >
            <SelectField
              emptyLabel="Nobody earns commission on this period"
              label="Salesperson"
              onChange={setChosen}
              options={salespeople.map((p) => ({ value: p.id, label: `${p.name} · ${p.salespersonCode}` }))}
              value={chosen}
            />
            <TextAreaField hint="For example, who visited the shop and when. Kept in the period's history." label="How you decided" onChange={setReason} requirement="required" value={reason} />
            <p className="text-xs text-slate-600">Once confirmed, this period&apos;s commission can never move to someone else.</p>
            <button className={primaryButton} disabled={busy || reason.trim().length < 10} type="submit">Confirm salesperson</button>
          </form>
        ) : null}
        {canResolve && !needsResolution ? (
          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-black text-slate-800">Recalculate this period</summary>
            <form
              className="mt-3 grid gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await run(() => recalculateSettlement(s, recalcReason.trim()), "Settlement recalculated.", "We couldn’t recalculate this settlement.")) setRecalcReason("");
              }}
            >
              <p className="text-sm text-slate-600">Use this after adding a missing commission rate, or after recording commission terms the salesperson had already accepted before this period began. Paid commission and the confirmed salesperson never change.</p>
              <TextField label="Reason" onChange={setRecalcReason} requirement="required" value={recalcReason} />
              <button className={secondaryButton} disabled={busy || recalcReason.trim().length < 10} type="submit">Recalculate</button>
            </form>
          </details>
        ) : null}
      </div>
    </AdminSection>
  );
}

function PaymentsSection({ settlement, canRecord, busy, run }: { settlement: Settlement; canRecord: boolean; busy: boolean; run: Runner }) {
  const s = settlement.summary;
  const [receivedOn, setReceivedOn] = useState(todayInMalaysia());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PartnerPaymentMethod>("BankTransfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState(newKey);
  const [voiding, setVoiding] = useState<SettlementReceipt | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const parsed = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= s.outstanding && reference.trim().length >= 3;
  const settled = s.status === "Settled" || s.status === "CreditDue";

  return (
    <AdminSection
      description="Money the partner sent for this period. A payment is recorded once; a mistake is voided with a reason, never edited."
      title="Partner payments"
    >
      <div className="grid gap-4 p-5">
        {settlement.receipts.length === 0 ? <p className="text-sm font-semibold text-slate-500">No payments recorded yet.</p> : (
          <ul className="grid gap-2">
            {settlement.receipts.map((receipt) => (
              <li className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ${receipt.voidedAt ? "bg-slate-50 text-slate-400" : "bg-[#eefaf4]"}`} key={receipt.id}>
                <span className="text-sm">
                  <span className="font-black">{MYR(receipt.amount)}</span> · received {shortDate(receipt.receivedOn)} · {methods.find((m) => m.value === receipt.method)?.label ?? receipt.method} · {receipt.reference}
                  {receipt.voidedAt ? <span className="block text-xs">Void: {receipt.voidReason}</span> : null}
                </span>
                {canRecord && !receipt.voidedAt && !settled ? (
                  <button className={textButton} disabled={busy} onClick={() => { setVoiding(receipt); setVoidReason(""); }} type="button">Void</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {voiding ? (
          <form
            className="grid gap-3 rounded-xl border border-[#ffd2c9] p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run(() => voidPartnerPayment(s.id, voiding, voidReason.trim()), "Payment voided.", "We couldn’t void this payment.")) setVoiding(null);
            }}
          >
            <p className="text-sm font-bold">Void the {MYR(voiding.amount)} payment recorded for {shortDate(voiding.receivedOn)}?</p>
            <TextAreaField label="Why it is void" onChange={setVoidReason} requirement="required" value={voidReason} />
            <div className="flex gap-2">
              <button className={secondaryButton} disabled={busy || voidReason.trim().length < 10} type="submit">Void payment</button>
              <button className={textButton} onClick={() => setVoiding(null)} type="button">Keep it</button>
            </div>
          </form>
        ) : null}
        {canRecord && s.outstanding > 0 ? (
          <form
            className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(
                () => recordPartnerPayment(s.id, { receivedOn, amount: parsed, method, reference: reference.trim(), notes: notes.trim() || null, idempotencyKey: key }),
                parsed === s.outstanding ? "Payment recorded. This period is settled and its sales commission is ready to pay." : "Payment recorded.",
                "We couldn’t record this payment.",
              );
              if (ok) { setAmount(""); setReference(""); setNotes(""); setKey(newKey()); }
            }}
          >
            <p className="text-sm font-black text-slate-900 sm:col-span-2">Record a payment · {MYR(s.outstanding)} outstanding</p>
            <DateField label="Date the money arrived" max={todayInMalaysia()} onChange={setReceivedOn} requirement="required" value={receivedOn} />
            <TextField hint={`Up to ${MYR(s.outstanding)}`} label="Amount (MYR)" onChange={setAmount} requirement="required" value={amount} />
            <SelectField emptyLabel="Choose a method" label="Method" onChange={(value) => setMethod((value || "BankTransfer") as PartnerPaymentMethod)} options={methods} requirement="required" value={method} />
            <TextField label="Bank or payment reference" onChange={setReference} requirement="required" value={reference} />
            <div className="sm:col-span-2"><TextAreaField label="Notes" onChange={setNotes} requirement="optional" value={notes} /></div>
            <button className={`${primaryButton} sm:col-span-2 sm:justify-self-start`} disabled={busy || !valid} type="submit">Record payment</button>
          </form>
        ) : null}
      </div>
    </AdminSection>
  );
}
