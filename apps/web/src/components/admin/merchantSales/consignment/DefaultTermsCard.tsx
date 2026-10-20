"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminStatusBadge } from "@/components/admin/AdminStatus";
import * as api from "@/services/adminConsignmentService";
import { dateTime, primaryButton, secondaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import { emptyDefaultTerms } from "./defaultTerms";
import { errorMessage, myPetLinkShare } from "./model";
import { Callout, TextAreaField, TextField, textButton } from "./ui";

type Errors = Partial<Record<keyof api.DefaultTermsValues, string>>;

const required: [keyof api.DefaultTermsValues, string][] = [
  ["partnerCommissionPercentage", "Partner commission"],
  ["trialDurationDays", "Trial duration"],
  ["durationTerms", "Duration and renewal"],
  ["settlementFrequency", "Settlement frequency"],
  ["paymentDeadlineDays", "Payment deadline"],
  ["discountTerms", "Discount permissions"],
  ["returnTerms", "Return terms"],
  ["lossTerms", "Loss and damage"],
];

/** Mirrors the server's checks. Completeness only matters when the defaults are put in use. */
export function validateDefaultTerms(v: api.DefaultTermsValues, activating: boolean): Errors {
  const errors: Errors = {};
  const rate = v.partnerCommissionPercentage;
  if (rate !== null && (Number.isNaN(rate) || rate < 0 || rate > 100 || Math.round(rate * 100) / 100 !== rate))
    errors.partnerCommissionPercentage = "Use a percentage from 0 to 100, with at most two decimal places.";
  const trial = v.trialDurationDays;
  if (trial !== null && (!Number.isInteger(trial) || trial < 1 || trial > 3650)) errors.trialDurationDays = "Use whole days from 1 to 3,650.";
  const deadline = v.paymentDeadlineDays;
  if (deadline !== null && (!Number.isInteger(deadline) || deadline < 0 || deadline > 365))
    errors.paymentDeadlineDays = "Use whole days from 0 to 365.";
  for (const key of ["durationTerms", "settlementFrequency", "discountTerms", "returnTerms", "lossTerms"] as const)
    if ((v[key]?.length ?? 0) > 2000) errors[key] = "Use 2,000 characters or fewer.";
  if (activating)
    for (const [key, label] of required)
      if (!errors[key] && (v[key] === null || (typeof v[key] === "string" && !(v[key] as string).trim()))) errors[key] = `Enter the default ${label.toLowerCase()}.`;
  return errors;
}

/**
 * Agreement Settings → Default agreement terms. The starting point for new drafts only:
 * saved agreements, issued PDFs and signed copies keep their own terms.
 */
export function DefaultTermsCard({ context }: { context: ConsignmentContext }) {
  const canEdit = context.can.approve;
  const [loaded, setLoaded] = useState<api.DefaultTerms | null>(null);
  const [form, setForm] = useState<api.DefaultTermsValues>(emptyDefaultTerms);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getDefaultTerms()
      .then((result) => {
        if (!active) return;
        setLoaded(result);
        setForm(result.terms);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [context.reloadKey]);

  const set = <K extends keyof api.DefaultTermsValues>(key: K, value: api.DefaultTermsValues[K]) => setForm((f) => ({ ...f, [key]: value }));
  const number = (value: string) => (value === "" ? null : Number(value));
  const changed = loaded !== null && JSON.stringify(form) !== JSON.stringify(loaded.terms);

  function submit(activate: boolean) {
    if (!loaded) return;
    const errors = validateDefaultTerms(form, activate);
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    context.actions.request({
      title: activate ? "Use these default terms for new agreements?" : loaded.isActive ? "Stop using default terms?" : "Save default terms?",
      message: activate
        ? "New agreement drafts will start from these terms. Each agreement keeps its own copy, so existing drafts, approved agreements, issued PDFs and signed copies don’t change."
        : "New agreement drafts will start with empty terms. Existing agreements don’t change.",
      confirmLabel: activate ? "Use for new agreements" : "Save",
      run: async () => {
        const result = await api.saveDefaultTerms(form, activate, loaded.concurrencyToken);
        setLoaded(result);
        setForm(result.terms);
        setShowErrors(false);
        return activate ? `Default terms revision ${result.revision} will be used for new agreements.` : "Default terms saved and not in use.";
      },
    });
  }

  const errors = showErrors ? validateDefaultTerms(form, true) : {};
  const status = !loaded ? null : loaded.isActive ? (
    <AdminStatusBadge dot tone="positive">In use · revision {loaded.revision}</AdminStatusBadge>
  ) : (
    <AdminStatusBadge dot tone="warning">Not in use</AdminStatusBadge>
  );

  return (
    <AdminSection
      action={status ?? undefined}
      compact
      description="Agreement Settings · the starting terms for every new agreement draft. Each agreement can change them, and keeps its own copy once saved."
      title="Default agreement terms"
    >
      <div className="grid gap-4 p-4 sm:p-5">
        {error ? (
          <Callout role="alert" tone="critical">
            {error}
          </Callout>
        ) : null}
        {!loaded && !error ? (
          <p className="text-sm font-semibold text-slate-500" role="status">
            Loading default terms…
          </p>
        ) : null}
        {loaded ? (
          <>
            {!loaded.isActive ? (
              <Callout title={loaded.updatedAt ? "Default terms are not in use" : "Suggested terms awaiting confirmation"} tone="warning">
                {loaded.updatedAt
                  ? "New agreements start with empty terms until these are put in use."
                  : "These suggested terms are not applied to any agreement. Review every clause, change what doesn’t match your policy, then put them in use."}
              </Callout>
            ) : null}
            <fieldset className="grid gap-4 sm:grid-cols-3" disabled={!canEdit}>
              <legend className="sr-only">Commercial defaults</legend>
              <TextField
                disabled={!canEdit}
                error={errors.partnerCommissionPercentage}
                hint={form.partnerCommissionPercentage === null ? "Share of each sale the partner keeps." : `MyPetLink receives ${myPetLinkShare(form.partnerCommissionPercentage)}%.`}
                inputMode="decimal"
                label="Partner commission (%)"
                onChange={(v) => set("partnerCommissionPercentage", number(v))}
                step="0.01"
                type="number"
                value={form.partnerCommissionPercentage === null ? "" : String(form.partnerCommissionPercentage)}
              />
              <TextField
                disabled={!canEdit}
                error={errors.trialDurationDays}
                hint="Calendar days, counting the start day. Suggests the end date."
                inputMode="numeric"
                label="Trial duration (days)"
                onChange={(v) => set("trialDurationDays", number(v))}
                type="number"
                value={form.trialDurationDays === null ? "" : String(form.trialDurationDays)}
              />
              <TextField
                disabled={!canEdit}
                error={errors.paymentDeadlineDays}
                hint="Whole days, from 0 to 365."
                inputMode="numeric"
                label="Payment deadline (days)"
                onChange={(v) => set("paymentDeadlineDays", number(v))}
                type="number"
                value={form.paymentDeadlineDays === null ? "" : String(form.paymentDeadlineDays)}
              />
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2" disabled={!canEdit}>
              <legend className="sr-only">Default clauses</legend>
              <TextAreaField disabled={!canEdit} error={errors.durationTerms} label="Duration and renewal" onChange={(v) => set("durationTerms", v || null)} value={form.durationTerms ?? ""} />
              <TextAreaField disabled={!canEdit} error={errors.settlementFrequency} label="Settlement frequency" onChange={(v) => set("settlementFrequency", v || null)} value={form.settlementFrequency ?? ""} />
              <TextAreaField disabled={!canEdit} error={errors.discountTerms} label="Discount permissions" onChange={(v) => set("discountTerms", v || null)} value={form.discountTerms ?? ""} />
              <TextAreaField disabled={!canEdit} error={errors.returnTerms} label="Return terms" onChange={(v) => set("returnTerms", v || null)} value={form.returnTerms ?? ""} />
              <div className="sm:col-span-2">
                <TextAreaField disabled={!canEdit} error={errors.lossTerms} label="Loss and damage responsibility" onChange={(v) => set("lossTerms", v || null)} value={form.lossTerms ?? ""} />
              </div>
            </fieldset>
            <p className="text-xs font-semibold text-slate-500">
              Start dates, signed agreement references, signing dates and tracker references are never defaults — they come from each partner.
              {loaded.updatedAt ? ` Last changed ${dateTime(loaded.updatedAt)}${loaded.updatedByName ? ` by ${loaded.updatedByName}` : ""}.` : ""}
            </p>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <button className={primaryButton} disabled={context.actions.busy || (loaded.isActive && !changed)} onClick={() => submit(true)} type="button">
                  {loaded.isActive ? "Save and use for new agreements" : "Put in use for new agreements"}
                </button>
                {loaded.isActive ? (
                  <button className={secondaryButton} disabled={context.actions.busy} onClick={() => submit(false)} type="button">
                    Stop using defaults
                  </button>
                ) : (
                  <button className={secondaryButton} disabled={context.actions.busy || !changed} onClick={() => submit(false)} type="button">
                    Save without using
                  </button>
                )}
                {changed ? (
                  <button className={textButton} onClick={() => setForm(loaded.terms)} type="button">
                    Discard changes
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs font-semibold text-slate-500">Changing default terms needs permission to approve agreements.</p>
            )}
            {loaded.history.length > 0 ? (
              <div className="grid gap-2">
                <button className={`${textButton} justify-self-start`} onClick={() => setShowHistory((v) => !v)} type="button">
                  {showHistory ? "Hide revision history" : `Revision history (${loaded.history.length})`}
                </button>
                {showHistory ? (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                    {loaded.history.map((h) => (
                      <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" key={h.revision}>
                        <span className="font-black text-slate-900">Revision {h.revision}</span>
                        <AdminStatusBadge tone={h.isActive ? "positive" : "neutral"}>{h.isActive ? "In use" : "Not in use"}</AdminStatusBadge>
                        <span className="text-xs text-slate-500">
                          {h.recordedByName ? `${dateTime(h.recordedAt)} by ${h.recordedByName}` : "Suggested starting terms"} · commission{" "}
                          {h.terms.partnerCommissionPercentage ?? "—"}% · trial {h.terms.trialDurationDays ?? "—"} days · payment{" "}
                          {h.terms.paymentDeadlineDays ?? "—"} days
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AdminSection>
  );
}
