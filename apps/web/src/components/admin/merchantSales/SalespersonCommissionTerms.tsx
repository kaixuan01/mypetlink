"use client";

import { useEffect, useState } from "react";
import { adminCapabilities as caps, hasCapability } from "@/lib/adminCapabilities";
import { getAdminCapabilities } from "@/services/authService";
import {
  endCommissionTerms,
  listCommissionTerms,
  recordCommissionTerms,
  type CommissionTerms,
} from "@/services/adminConsignmentSettlementService";
import { getMerchantSalesError } from "@/services/adminMerchantSalesService";
import { fieldClass, InlineError, primaryButton, secondaryButton, shortDate } from "./shared";

// Which commission terms govern a salesperson. Without a recorded v1.1 acceptance
// they stay on their existing terms; nothing moves anyone automatically.

const todayInMalaysia = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
/** Midnight Malaysia time on a yyyy-mm-dd date. */
const malaysiaMidnight = (date: string) => `${date}T00:00:00+08:00`;

export function SalespersonCommissionTerms({ salespersonId }: { salespersonId: string }) {
  const canManage = hasCapability(getAdminCapabilities(), caps.salesCommissionRulesManage);
  const [terms, setTerms] = useState<CommissionTerms[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [acceptedOn, setAcceptedOn] = useState(todayInMalaysia());
  const [effectiveOn, setEffectiveOn] = useState(todayInMalaysia());
  const [reference, setReference] = useState("");
  const [ending, setEnding] = useState<CommissionTerms | null>(null);
  const [endOn, setEndOn] = useState(todayInMalaysia());
  const [endReason, setEndReason] = useState("");

  useEffect(() => {
    let live = true;
    listCommissionTerms(salespersonId)
      .then((result) => { if (live) setTerms(result); })
      .catch((caught) => { if (live) setError(getMerchantSalesError(caught, "We couldn’t load this salesperson’s commission terms.")); });
    return () => { live = false; };
  }, [salespersonId]);

  const current = terms?.find((t) => !t.effectiveToExclusive || new Date(t.effectiveToExclusive) > new Date());

  async function record() {
    setBusy(true); setError("");
    try {
      const saved = await recordCommissionTerms(salespersonId, {
        policyCode: "v1.1", acceptedAt: malaysiaMidnight(acceptedOn), effectiveFrom: malaysiaMidnight(effectiveOn),
        agreementReference: reference.trim(), notes: null,
      });
      setTerms((existing) => [saved, ...(existing ?? [])]);
      setRecording(false); setReference("");
    } catch (caught) { setError(getMerchantSalesError(caught, "We couldn’t record these terms.")); }
    finally { setBusy(false); }
  }

  async function end() {
    if (!ending) return;
    setBusy(true); setError("");
    try {
      const saved = await endCommissionTerms(ending, malaysiaMidnight(endOn), endReason.trim());
      setTerms((existing) => (existing ?? []).map((t) => (t.id === saved.id ? saved : t)));
      setEnding(null); setEndReason("");
    } catch (caught) { setError(getMerchantSalesError(caught, "We couldn’t end these terms.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-black text-slate-900">Commission terms</p>
      <p className="mt-1 text-sm text-slate-600">
        {current
          ? `On ${current.policyCode} terms from ${shortDate(current.effectiveFrom)}${current.effectiveToExclusive ? ` until ${shortDate(current.effectiveToExclusive)}` : ""}. Consignment sales they service earn RM4.50 per standard-price tag and RM4.00 per promotion-price tag.`
          : "On their existing terms. They earn no consignment commission until v1.1 terms are recorded."}
      </p>
      {error ? <div className="mt-3"><InlineError message={error} /></div> : null}
      {terms && terms.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {terms.map((t) => (
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm" key={t.id}>
              <span>
                <span className="font-black">{t.policyCode}</span> · accepted {shortDate(t.acceptedAt)} · from {shortDate(t.effectiveFrom)}
                {t.effectiveToExclusive ? ` · ends ${shortDate(t.effectiveToExclusive)}` : ""} · {t.agreementReference}
                {t.endReason ? <span className="block text-xs text-slate-500">Ended: {t.endReason}</span> : null}
              </span>
              {canManage && !t.endedAt ? (
                <button className={secondaryButton} disabled={busy} onClick={() => { setEnding(t); setEndOn(todayInMalaysia()); setEndReason(""); }} type="button">End terms</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canManage && !current && !recording ? (
        <button className={`${primaryButton} mt-3`} onClick={() => setRecording(true)} type="button">Record v1.1 terms</button>
      ) : null}
      {recording ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">Accepted on<input className={fieldClass} max={todayInMalaysia()} onChange={(e) => setAcceptedOn(e.target.value)} type="date" value={acceptedOn} /></label>
          <label className="grid gap-1 text-sm font-bold">Takes effect on<input className={fieldClass} min={acceptedOn} onChange={(e) => setEffectiveOn(e.target.value)} type="date" value={effectiveOn} /></label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">Where they accepted it<input className={fieldClass} maxLength={200} onChange={(e) => setReference(e.target.value)} placeholder="For example, signed commission letter dated 1 Nov" value={reference} /></label>
          <p className="text-xs text-slate-600 sm:col-span-2">Terms can&apos;t start before the salesperson accepted them, and they never change commission already earned.</p>
          <div className="flex gap-2 sm:col-span-2">
            <button className={primaryButton} disabled={busy || reference.trim().length < 3 || effectiveOn < acceptedOn} onClick={() => void record()} type="button">Record terms</button>
            <button className={secondaryButton} disabled={busy} onClick={() => setRecording(false)} type="button">Cancel</button>
          </div>
        </div>
      ) : null}
      {ending ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">End from<input className={fieldClass} min={todayInMalaysia()} onChange={(e) => setEndOn(e.target.value)} type="date" value={endOn} /></label>
          <label className="grid gap-1 text-sm font-bold">Reason<input className={fieldClass} maxLength={1000} onChange={(e) => setEndReason(e.target.value)} value={endReason} /></label>
          <p className="text-xs text-slate-600 sm:col-span-2">Terms end from a date that hasn&apos;t passed, so commission on sales not yet verified is never taken away.</p>
          <div className="flex gap-2 sm:col-span-2">
            <button className={primaryButton} disabled={busy || endReason.trim().length < 10} onClick={() => void end()} type="button">End terms</button>
            <button className={secondaryButton} disabled={busy} onClick={() => setEnding(null)} type="button">Keep them</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
