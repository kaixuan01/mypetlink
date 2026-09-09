"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { Badge } from "@/components/ui/Badge";
import { isAbortError } from "@/services/apiClient";
import {
  createCommissionRule,
  listCommissionRules,
  listCommissions,
  reverseCommission,
  updateCommissionRule,
  type AdminCommissionRule,
  type AdminSalesCommission,
  type CommissionRuleType,
} from "@/services/adminMerchantBillingService";
import {
  getMerchantSalesError,
  listMerchants,
  listSalespersons,
  type AdminMerchant,
  type AdminSalesperson,
} from "@/services/adminMerchantSalesService";
import { downloadCommissionLedger } from "@/services/adminSalesReportingService";
import {
  dateTime,
  fieldClass,
  InlineError,
  money,
  primaryButton,
  secondaryButton,
  StatusMessage,
} from "./shared";

const commissionPageSize = 50;

export function CommissionsPanel({
  canManageRules = true,
  canReverse = true,
  onOpenPayout = () => undefined,
}: {
  canManageRules?: boolean;
  canReverse?: boolean;
  onOpenPayout?: (payoutId: string) => void;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [commissionPage, setCommissionPage] = useState(1);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [commissions, setCommissions] = useState<AdminSalesCommission[]>([]);
  const [rules, setRules] = useState<AdminCommissionRule[]>([]);
  const [salespersons, setSalespersons] = useState<AdminSalesperson[]>([]);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingRule, setEditingRule] = useState<AdminCommissionRule | "new" | null>(null);
  const [reversing, setReversing] = useState<AdminSalesCommission | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(() => `${new Date().getUTCFullYear()}-01-01`);
  const [through, setThrough] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [commissionType, setCommissionType] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [search, setSearch] = useState("");
  const refresh = useCallback(() => {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listCommissions(
        {
          page: commissionPage,
          pageSize: commissionPageSize,
          from: utcStart(from),
          toExclusive: nextDay(through),
          status: status || undefined,
          channel: channel || undefined,
          commissionType: commissionType || undefined,
          salespersonId: salespersonId || undefined,
          merchantId: merchantId || undefined,
          search: search.trim() || undefined,
        },
        controller.signal
      ),
      canManageRules
        ? listCommissionRules({ page: 1, pageSize: 100 }, controller.signal)
        : Promise.resolve({ items: [], total: 0 }),
      listSalespersons({ page: 1, pageSize: 100 }, controller.signal),
      listMerchants({ page: 1, pageSize: 100 }, controller.signal),
    ])
      .then(([commissionResult, ruleResult, salespersonResult, merchantResult]) => {
        if (controller.signal.aborted) return;
        setCommissions(commissionResult.items);
        setCommissionTotal(commissionResult.total);
        setRules(ruleResult.items);
        setSalespersons(salespersonResult.items);
        setMerchants(merchantResult.items);
        setError("");
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setError(getMerchantSalesError(caught, "We couldn’t load commissions."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canManageRules, channel, commissionPage, commissionType, from, merchantId, reloadKey, salespersonId, search, status, through]);

  function changeCommissionPage(nextPage: number) {
    setLoading(true);
    setCommissionPage(nextPage);
  }

  async function reverse() {
    if (!reversing || !reversalReason.trim() || busy) return;
    setBusy(true);
    try {
      await reverseCommission(reversing.id, reversalReason.trim(), reversing.concurrencyToken);
      setMessage(`Commission for ${reversing.salespersonName} reversed.`);
      setError("");
      setReversing(null);
      setReversalReason("");
      refresh();
    } catch (caught) {
      setMessage("");
      setError(getMerchantSalesError(caught, "We couldn’t reverse this commission."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {message ? <StatusMessage message={message} /> : null}
      <InlineError message={error} />

      <AdminSection
        action={<button className={secondaryButton} disabled={busy} onClick={() => {
          setBusy(true);
          void downloadCommissionLedger({
            page: 1, pageSize: 100, from: utcStart(from), toExclusive: nextDay(through),
            status: status || undefined, channel: channel || undefined,
            commissionType: commissionType || undefined, salespersonId: salespersonId || undefined,
            merchantId: merchantId || undefined,
            search: search.trim() || undefined,
          }).catch((caught) => setError(getMerchantSalesError(caught, "We couldn’t export the commission ledger."))).finally(() => setBusy(false));
        }} type="button">Export CSV</button>}
        description="One auditable ledger for merchant and direct retail sales. Payable rows are settled through payout batches; reversed entries remain visible."
        title="Sales commissions"
      >
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-bold">From<input className={fieldClass} type="date" value={from} onChange={(event) => { setFrom(event.target.value); setCommissionPage(1); }} /></label>
          <label className="grid gap-1 text-sm font-bold">Through<input className={fieldClass} type="date" value={through} onChange={(event) => { setThrough(event.target.value); setCommissionPage(1); }} /></label>
          <label className="grid gap-1 text-sm font-bold">Seller<select className={fieldClass} value={salespersonId} onChange={(event) => { setSalespersonId(event.target.value); setCommissionPage(1); }}><option value="">All sellers</option>{salespersons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-bold">Channel<select className={fieldClass} value={channel} onChange={(event) => { setChannel(event.target.value); setCommissionPage(1); }}><option value="">All channels</option><option value="retail">Direct retail</option><option value="merchant">Merchant</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Type<select className={fieldClass} value={commissionType} onChange={(event) => { setCommissionType(event.target.value); setCommissionPage(1); }}><option value="">All types</option><option value="DirectRetailPercentage">Direct retail</option><option value="MerchantOrderPercentage">Legacy merchant</option><option value="ResellerAcquisitionBonus">Acquisition bonus</option><option value="ResellerRepeatPercentage">Repeat reseller</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Status<select className={fieldClass} value={status} onChange={(event) => { setStatus(event.target.value); setCommissionPage(1); }}><option value="">All statuses</option><option value="Payable">Payable</option><option value="Paid">Paid</option><option value="Reversed">Reversed</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Merchant<select className={fieldClass} value={merchantId} onChange={(event) => { setMerchantId(event.target.value); setCommissionPage(1); }}><option value="">All merchants</option>{merchants.map((item) => <option key={item.id} value={item.id}>{item.tradingName ?? item.legalBusinessName}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-bold">Order number<input className={fieldClass} value={search} onChange={(event) => { setSearch(event.target.value); setCommissionPage(1); }} /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Channel and type</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Salesperson</th>
                <th className="px-4 py-3">Calculation</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">History</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {commissions.map((commission) => (
                <tr key={commission.id}>
                  <td className="px-4 py-3 align-top font-bold text-slate-900">
                    <p>{sourceLabel(commission.sourceType)}</p>
                    <p className="text-xs font-semibold text-slate-500">
                      {typeLabel(commission.commissionType)}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-xs font-bold">
                    {commission.sourceOrderNumber}
                    {commission.merchantName ? <p className="mt-1 font-sans font-semibold text-slate-500">{commission.merchantName}</p> : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-bold">{commission.salespersonName}</p>
                    <p className="text-xs text-slate-500">{commission.salespersonCode}</p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p>{money(commission.currency, commission.commissionBaseAmount)} base</p>
                    <p className="text-xs text-slate-500">
                      {commission.commissionPercentage == null
                        ? `${money(commission.currency, commission.commissionFixedAmount ?? 0)} fixed`
                        : `${commission.commissionPercentage}%`}
                    </p>
                    {commission.commissionRuleId ? (
                      <p className="text-xs text-slate-500">
                        Rule {commission.commissionRuleId.slice(0, 8)} · effective {dateTime(commission.commissionRuleEffectiveFrom)}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">Historical order snapshot</p>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top font-black">
                    {money(commission.currency, commission.commissionAmount)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge tone={statusTone(commission.status)}>{commission.status}</Badge>
                    <p className="mt-1 text-xs font-bold text-slate-600">
                      {claimStateLabel(commission)}
                    </p>
                    {commission.payoutId && commission.payoutNumber ? (
                      <button
                        className="mt-1 text-xs font-bold text-[#1570ef] underline underline-offset-2"
                        onClick={() => onOpenPayout(commission.payoutId!)}
                        type="button"
                      >
                        View {commission.payoutNumber}
                      </button>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">Calculated {dateTime(commission.calculatedAt)}</p>
                    {commission.paidAt ? <p className="text-xs text-slate-500">Paid {dateTime(commission.paidAt)}{commission.paidByAdminUserId ? ` · Admin ${commission.paidByAdminUserId.slice(0, 8)}` : ""}</p> : null}
                    {commission.reversedAt ? (
                      <p className="text-xs text-slate-500">
                        Reversed {dateTime(commission.reversedAt)}{commission.reversedByAdminUserId ? ` · Admin ${commission.reversedByAdminUserId.slice(0, 8)}` : ""} · {commission.reversalReason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {canReverse && commission.status !== "Reversed" ? (
                        <button
                          className={secondaryButton}
                          disabled={busy}
                          onClick={() => {
                            setReversing(commission);
                            setReversalReason("");
                          }}
                          type="button"
                        >
                          Reverse
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && commissions.length === 0 ? (
            <p className="p-5 text-sm font-semibold text-slate-500">No commission history yet.</p>
          ) : null}
          {loading ? <p className="p-5 text-sm font-semibold text-slate-500">Loading commissions…</p> : null}
        </div>
        {!loading && commissionTotal > 0 ? (
          <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {(commissionPage - 1) * commissionPageSize + 1}–{Math.min(commissionPage * commissionPageSize, commissionTotal)} of {commissionTotal}
            </p>
            <div className="flex gap-2">
              <button
                className={secondaryButton}
                disabled={commissionPage === 1}
                onClick={() => changeCommissionPage(commissionPage - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                className={secondaryButton}
                disabled={commissionPage * commissionPageSize >= commissionTotal}
                onClick={() => changeCommissionPage(commissionPage + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </AdminSection>

      {canReverse && reversing ? (
        <AdminSection
          description={`The original amount and any payout history for ${reversing.sourceOrderNumber} will remain visible.`}
          title="Reverse commission"
        >
          <div className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-bold text-pet-ink">
              Reason
              <textarea
                className={`${fieldClass} min-h-24 py-3`}
                maxLength={1000}
                onChange={(event) => setReversalReason(event.target.value)}
                value={reversalReason}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button className={secondaryButton} onClick={() => setReversing(null)} type="button">Cancel</button>
              <button className={primaryButton} disabled={busy || !reversalReason.trim()} onClick={() => void reverse()} type="button">
                Reverse commission
              </button>
            </div>
          </div>
        </AdminSection>
      ) : null}

      {canManageRules && editingRule ? (
        <CommissionRuleEditor
          rule={editingRule === "new" ? undefined : editingRule}
          salespersons={salespersons}
          onCancel={() => setEditingRule(null)}
          onError={(value) => setError(value)}
          onSaved={(saved) => {
            setEditingRule(null);
            setMessage(`${saved.salespersonName ?? "Global"} ${ruleTypeLabel(saved.commissionType).toLowerCase()} rule saved.`);
            refresh();
          }}
        />
      ) : null}

      {canManageRules ? <AdminSection
        action={<button className={primaryButton} onClick={() => setEditingRule("new")} type="button">New rule</button>}
        description="Effective-dated retail and reseller policies. A salesperson-specific rule takes precedence over the global rule."
        title="Commission rules"
      >
        <div className="grid gap-3 p-5">
          {rules.map((rule) => (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between" key={rule.id}>
              <div>
                <p className="font-black text-slate-900">
                  {rule.salespersonName ?? "All salespersons"} · {ruleTypeLabel(rule.commissionType)} · {ruleValueLabel(rule)}
                </p>
                <p className="text-sm font-semibold text-slate-500">
                  {dateTime(rule.effectiveFrom)} to {rule.effectiveTo ? dateTime(rule.effectiveTo) : "no set end"}
                  {quantityLabel(rule)}
                </p>
                {rule.notes ? <p className="mt-1 text-sm text-slate-600">{rule.notes}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={rule.isActive ? "mint" : "soft"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                <button className={secondaryButton} onClick={() => setEditingRule(rule)} type="button">Edit</button>
              </div>
            </div>
          ))}
          {!loading && rules.length === 0 ? <p className="text-sm font-semibold text-slate-500">No commission rules found.</p> : null}
        </div>
      </AdminSection> : null}
    </div>
  );
}

function CommissionRuleEditor({
  rule,
  salespersons,
  onCancel,
  onSaved,
  onError,
}: {
  rule?: AdminCommissionRule;
  salespersons: AdminSalesperson[];
  onCancel: () => void;
  onSaved: (saved: AdminCommissionRule) => void;
  onError: (message: string) => void;
}) {
  const [commissionType, setCommissionType] = useState<CommissionRuleType>(
    rule?.commissionType ?? "DirectRetailPercentage"
  );
  const [salespersonId, setSalespersonId] = useState(rule?.salespersonId ?? "");
  const [percentage, setPercentage] = useState(String(rule?.percentage ?? 15));
  const [fixedAmount, setFixedAmount] = useState(String(rule?.fixedAmount ?? 50));
  const [eligibilityMonths, setEligibilityMonths] = useState(String(rule?.eligibilityMonths ?? 3));
  const [minQuantity, setMinQuantity] = useState(rule?.minQuantity?.toString() ?? "");
  const [maxQuantity, setMaxQuantity] = useState(rule?.maxQuantity?.toString() ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(toInputDate(rule?.effectiveFrom ?? new Date().toISOString()));
  const [effectiveTo, setEffectiveTo] = useState(toInputDate(rule?.effectiveTo));
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [notes, setNotes] = useState(rule?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const input = useMemo(() => ({
    commissionType,
    salespersonId: salespersonId || null,
    percentage: commissionType === "ResellerAcquisitionBonus" ? null : Number(percentage),
    fixedAmount: commissionType === "ResellerAcquisitionBonus" ? Number(fixedAmount) : null,
    minQuantity: commissionType === "ResellerRepeatPercentage" ? null : minQuantity ? Number(minQuantity) : null,
    maxQuantity: commissionType === "ResellerRepeatPercentage" ? null : maxQuantity ? Number(maxQuantity) : null,
    eligibilityMonths: commissionType === "ResellerRepeatPercentage" ? Number(eligibilityMonths) : null,
    currency: "MYR" as const,
    effectiveFrom: toIso(effectiveFrom),
    effectiveTo: effectiveTo ? toIso(effectiveTo) : null,
    isActive,
    notes: notes.trim() || null,
    concurrencyToken: rule?.concurrencyToken ?? null,
  }), [commissionType, effectiveFrom, effectiveTo, eligibilityMonths, fixedAmount, isActive, maxQuantity, minQuantity, notes, percentage, rule?.concurrencyToken, salespersonId]);

  return (
    <AdminSection description="Overlapping active rules for the same salesperson and quantity range are refused." title={rule ? "Edit commission rule" : "New commission rule"}>
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          onError("");
          const operation = rule ? updateCommissionRule(rule.id, input) : createCommissionRule(input);
          void operation
            .then(onSaved)
            .catch((caught) => onError(getMerchantSalesError(caught, "We couldn’t save this commission rule.")))
            .finally(() => setSaving(false));
        }}
      >
        <label className="grid gap-1 text-sm font-bold text-pet-ink">
          Commission type
          <select className={fieldClass} disabled={Boolean(rule)} onChange={(event) => setCommissionType(event.target.value as CommissionRuleType)} value={commissionType}>
            <option value="DirectRetailPercentage">Direct retail percentage</option>
            <option value="ResellerAcquisitionBonus">Reseller acquisition bonus</option>
            <option value="ResellerRepeatPercentage">Reseller repeat percentage</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold text-pet-ink">
          Applies to
          <select className={fieldClass} onChange={(event) => setSalespersonId(event.target.value)} value={salespersonId}>
            <option value="">All salespersons</option>
            {salespersons.map((salesperson) => <option key={salesperson.id} value={salesperson.id}>{salesperson.name} · {salesperson.salespersonCode}</option>)}
          </select>
        </label>
        {commissionType === "ResellerAcquisitionBonus" ? (
          <Field label="Fixed bonus (RM)" min="0" required step="0.01" value={fixedAmount} onChange={setFixedAmount} />
        ) : (
          <Field label="Percentage" min="0" max="100" required step="0.01" value={percentage} onChange={setPercentage} />
        )}
        {commissionType !== "ResellerRepeatPercentage" ? (
          <>
            <Field label="Minimum quantity" min="1" required={commissionType === "ResellerAcquisitionBonus"} step="1" value={minQuantity} onChange={setMinQuantity} />
            <Field label="Maximum quantity" min="1" step="1" value={maxQuantity} onChange={setMaxQuantity} />
          </>
        ) : (
          <Field label="Eligibility months" min="1" max="120" required step="1" value={eligibilityMonths} onChange={setEligibilityMonths} />
        )}
        <Field label="Effective from" required type="datetime-local" value={effectiveFrom} onChange={setEffectiveFrom} />
        <Field label="Effective to" type="datetime-local" value={effectiveTo} onChange={setEffectiveTo} />
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-pet-ink">
          <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" /> Active
        </label>
        <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
          Notes — Admin only
          <textarea className={`${fieldClass} min-h-20 py-3`} maxLength={2000} onChange={(event) => setNotes(event.target.value)} value={notes} />
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button className={secondaryButton} onClick={onCancel} type="button">Cancel</button>
          <button className={primaryButton} disabled={saving} type="submit">{saving ? "Saving…" : "Save rule"}</button>
        </div>
      </form>
    </AdminSection>
  );
}

function Field({ label, value, onChange, type = "number", min, max, step, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; max?: string; step?: string; required?: boolean }) {
  return <label className="grid gap-1 text-sm font-bold text-pet-ink">{label}<input className={fieldClass} max={max} min={min} onChange={(event) => onChange(event.target.value)} required={required} step={step} type={type} value={value} /></label>;
}

function sourceLabel(source: AdminSalesCommission["sourceType"]) {
  return source === "MerchantOrder" ? "Merchant" : "Direct retail";
}

function typeLabel(type: AdminSalesCommission["commissionType"]) {
  if (type === "MerchantOrderPercentage") return "Merchant order percentage";
  if (type === "DirectRetailPercentage") return "Direct retail percentage";
  if (type === "ResellerAcquisitionBonus") return "Reseller acquisition bonus";
  return "Reseller repeat percentage";
}

function ruleTypeLabel(type: CommissionRuleType) {
  if (type === "DirectRetailPercentage") return "Direct retail percentage";
  if (type === "ResellerAcquisitionBonus") return "Reseller acquisition bonus";
  return "Reseller repeat percentage";
}

function ruleValueLabel(rule: AdminCommissionRule) {
  if (rule.fixedAmount != null) return `RM ${rule.fixedAmount.toFixed(2)}`;
  const duration = rule.eligibilityMonths ? ` for ${rule.eligibilityMonths} months` : "";
  return `${rule.percentage ?? 0}%${duration}`;
}

function statusTone(status: AdminSalesCommission["status"]): "mint" | "danger" | "teal" {
  return status === "Reversed" ? "danger" : status === "Paid" ? "mint" : "teal";
}

function claimStateLabel(commission: AdminSalesCommission) {
  if (commission.payoutClaimState === "ReservedInPreparedPayout") {
    return "Reserved in Prepared payout";
  }
  if (commission.payoutClaimState === "IncludedInPaidPayout") {
    return commission.requiresRecovery ? "Paid through payout · Recovery required" : "Paid through payout";
  }
  if (commission.payoutClaimState === "LegacyIndividualPaid") {
    return "Legacy individual payout";
  }
  return commission.status === "Payable" ? "Payable / Unclaimed" : commission.status;
}

function toInputDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function quantityLabel(rule: AdminCommissionRule) {
  if (rule.minQuantity == null && rule.maxQuantity == null) return " · all quantities";
  if (rule.minQuantity != null && rule.maxQuantity != null) return ` · quantities ${rule.minQuantity}–${rule.maxQuantity}`;
  if (rule.minQuantity != null) return ` · quantity ${rule.minQuantity}+`;
  return ` · up to ${rule.maxQuantity}`;
}

function nextDay(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function utcStart(value: string) {
  return value ? `${value}T00:00:00Z` : "";
}
