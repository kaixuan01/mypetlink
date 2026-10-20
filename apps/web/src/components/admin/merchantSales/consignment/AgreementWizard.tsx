"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import type { AdminMerchant } from "@/services/adminMerchantSalesService";
import * as api from "@/services/adminConsignmentService";
import { primaryButton, secondaryButton, shortDate } from "../shared";
import { AgreementTermsSummary } from "./AgreementTermsSummary";
import {
  agreementInputFrom,
  dateInputValue,
  emptyAgreement,
  endOfDayIso,
  errorMessage,
  myPetLinkShare,
  pendingTermsFor,
  startOfDayIso,
  validateAgreement,
} from "./model";
import { applyDefaultTerms, differsFromDefaults, emptyDefaultTerms, normalizePrefix, prefixProblem, suggestedEndIso } from "./defaultTerms";
import { Callout, DateField, SelectField, TextAreaField, TextField, WorkflowStepper, textButton } from "./ui";

export type AgreementRequest =
  | { mode: "new" }
  | { mode: "edit"; agreement: api.Agreement }
  | { mode: "revision"; agreement: api.Agreement };

const steps = [
  { id: "partner", label: "Partner" },
  { id: "terms", label: "Commercial terms" },
  { id: "review", label: "Review" },
  { id: "approval", label: "Approval" },
] as const;

const stepFields: (keyof api.AgreementInput)[][] = [
  ["merchantId", "reference"],
  [
    "partnerCommissionPercentage",
    "effectiveFrom",
    "effectiveTo",
    "paymentDeadlineDays",
    "durationTerms",
    "settlementFrequency",
    "discountTerms",
    "returnTerms",
    "lossTerms",
    "signedAgreementReference",
    "externalTrackerReference",
  ],
];

/**
 * New agreement, draft edit and new version, one step at a time:
 * partner → commercial terms → review → save, then approval when the signed
 * evidence exists. Values survive moving between steps and a failed save.
 */
export function AgreementWizard({
  request,
  merchants,
  canApprove,
  onClose,
  onSaved,
  onApprove,
}: {
  request: AgreementRequest;
  merchants: AdminMerchant[];
  canApprove: boolean;
  onClose: () => void;
  onSaved: (saved: api.Agreement, message: string) => void;
  onApprove: (saved: api.Agreement) => void;
}) {
  const initial = request.mode === "new" ? { ...emptyAgreement } : agreementInputFrom(request.agreement, request.mode === "revision");
  const [form, setForm] = useState<api.AgreementInput>(initial);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState<boolean[]>([false, false]);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<api.Agreement | null>(null);
  // One logical "create draft": a retry after a lost response returns the same draft and number.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );
  const isNew = request.mode === "new";
  const [defaults, setDefaults] = useState<api.DefaultTerms | null>(null);
  const [defaultsState, setDefaultsState] = useState<"loading" | "applied" | "inactive" | "error" | "none">(isNew ? "loading" : "none");
  const [appliedRevision, setAppliedRevision] = useState<number | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  // A date the operator picked is never replaced by a suggestion.
  const [endTouched, setEndTouched] = useState(!isNew);
  const [prefix, setPrefix] = useState<api.AgreementPrefix | null>(null);
  const [prefixDraft, setPrefixDraft] = useState<string | null>(null);
  const [prefixError, setPrefixError] = useState("");
  const [prefixSaving, setPrefixSaving] = useState(false);

  // Default terms fill an untouched form once. The saved draft keeps its own copy.
  useEffect(() => {
    if (!isNew) return;
    let active = true;
    api
      .getDefaultTerms()
      .then((result) => {
        if (!active) return;
        setDefaults(result);
        if (!result.isActive) {
          setDefaultsState("inactive");
          return;
        }
        setForm((current) => (differsFromDefaults(current, emptyDefaultTerms) ? current : applyDefaultTerms(current, result.terms)));
        setAppliedRevision(result.revision);
        setDefaultsState("applied");
      })
      .catch(() => {
        if (active) setDefaultsState("error");
      });
    return () => {
      active = false;
    };
  }, [isNew]);

  const merchantId = form.merchantId;
  useEffect(() => {
    if (!isNew || !merchantId) return;
    let active = true;
    api
      .getAgreementPrefix(merchantId)
      .then((result) => {
        if (active) setPrefix(result);
      })
      .catch((e) => {
        if (active) setPrefixError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [isNew, merchantId]);

  const trialDays = appliedRevision !== null ? (defaults?.terms.trialDurationDays ?? null) : null;

  function restoreDefaults() {
    if (!defaults?.isActive) return;
    setForm((current) => applyDefaultTerms(current, defaults.terms));
    setAppliedRevision(defaults.revision);
    setConfirmRestore(false);
    setDirty(true);
  }

  async function savePrefix() {
    if (!prefix || prefixDraft === null) return;
    const value = normalizePrefix(prefixDraft);
    const problem = prefixProblem(value);
    if (problem) {
      setPrefixError(problem);
      return;
    }
    setPrefixSaving(true);
    setPrefixError("");
    try {
      setPrefix(await api.saveAgreementPrefix(prefix.merchantId, value, prefix.concurrencyToken));
      setPrefixDraft(null);
    } catch (e) {
      setPrefixError(errorMessage(e));
    } finally {
      setPrefixSaving(false);
    }
  }

  const locked = request.mode !== "new";
  const errors = validateAgreement(form);
  const visible = (key: keyof api.AgreementInput) =>
    stepFields.some((fields, index) => showErrors[index] && fields.includes(key)) ? errors[key] : undefined;
  const pending = pendingTermsFor(form);

  function change<K extends keyof api.AgreementInput>(key: K, value: api.AgreementInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setConfirmDiscard(false);
  }

  function next() {
    const fields = stepFields[step] ?? [];
    if (fields.some((key) => errors[key])) {
      setShowErrors((current) => current.map((value, index) => (index === step ? true : value)));
      return;
    }
    setStep((current) => current + 1);
  }

  function requestClose() {
    if (dirty && !saved && !saving) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  async function save() {
    if (Object.keys(errors).length > 0) {
      setShowErrors([true, true]);
      setStep(errors.merchantId || errors.reference ? 0 : 1);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const editing = request.mode === "edit" ? request.agreement : null;
      const result = await api.saveAgreement(form, editing?.id, editing?.concurrencyToken,
        editing ? {} : { idempotencyKey, defaultTermsRevision: isNew ? appliedRevision : null });
      setSaved(result);
      setDirty(false);
      setStep(3);
      onSaved(result, request.mode === "edit" ? "Agreement draft updated." : "Agreement draft saved.");
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const merchantOptions = merchants.map((m) => ({ value: m.id, label: m.tradingName ?? m.legalBusinessName }));
  // A locked partner may no longer be active, so it is not in the picker list.
  if (request.mode !== "new" && !merchantOptions.some((m) => m.value === form.merchantId)) {
    merchantOptions.unshift({ value: form.merchantId, label: request.agreement.merchantName });
  }
  const merchantName = merchantOptions.find((m) => m.value === form.merchantId)?.label ?? "";
  const title =
    request.mode === "edit" ? "Edit agreement draft" : request.mode === "revision" ? "New agreement version" : "New consignment agreement";
  const stages = steps.map((s, index) => ({
    id: s.id,
    label: s.label,
    state: (index < step ? "done" : index === step ? "current" : "upcoming") as "done" | "current" | "upcoming",
  }));

  const footer = confirmDiscard ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
      <p className="text-sm font-bold text-[#a63c2e]">Discard this unsaved agreement? Nothing has been saved yet.</p>
      <div className="flex gap-2">
        <button className={secondaryButton} onClick={() => setConfirmDiscard(false)} type="button">
          Keep editing
        </button>
        <button className={`${primaryButton} !bg-[#a63c2e]`} onClick={onClose} type="button">
          Discard
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {step > 0 && step < 3 ? (
          <button className={secondaryButton} disabled={saving} onClick={() => setStep((current) => current - 1)} type="button">
            Back
          </button>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {step < 3 ? (
          <button className={secondaryButton} disabled={saving} onClick={requestClose} type="button">
            Cancel
          </button>
        ) : null}
        {step < 2 ? (
          <button className={primaryButton} onClick={next} type="button">
            Continue
          </button>
        ) : null}
        {step === 2 ? (
          <button className={primaryButton} disabled={saving} onClick={() => void save()} type="button">
            {saving ? "Saving…" : "Save draft"}
          </button>
        ) : null}
        {step === 3 && saved ? (
          <>
            <button className={secondaryButton} onClick={onClose} type="button">
              {canApprove && saved.pendingTerms.length === 0 ? "Approve later" : "Done"}
            </button>
            {canApprove && saved.pendingTerms.length === 0 ? (
              <button className={primaryButton} onClick={() => onApprove(saved)} type="button">
                Continue to approval
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <FormDialog
      closeOnBackdrop={false}
      description={
        request.mode === "revision"
          ? `Based on ${request.agreement.reference} v${request.agreement.version}. The approved version stays in force until this one is approved.`
          : "Record the terms agreed with the partner. Saving creates a draft; nothing is binding until the signed agreement is recorded and approved."
      }
      eyebrow="Consignment"
      footer={footer}
      maxWidthClassName="sm:max-w-3xl"
      onRequestClose={requestClose}
      open
      title={title}
    >
      <div className="grid gap-5">
        <WorkflowStepper label="Agreement steps" stages={stages} />

        {step === 0 ? (
          <section aria-labelledby="wizard-partner" className="grid gap-4">
            <h3 className="text-base font-black text-slate-950" id="wizard-partner">
              Which partner is this agreement with?
            </h3>
            <SelectField
              disabled={locked}
              emptyLabel={merchants.length ? "Choose merchant" : "No active merchants available"}
              error={visible("merchantId")}
              hint={locked ? "A draft or new version keeps its original partner." : "Only active merchants are listed."}
              label="Merchant"
              onChange={(value) => {
                change("merchantId", value);
                setPrefix(null);
                setPrefixDraft(null);
                setPrefixError("");
              }}
              options={merchantOptions}
              requirement="required"
              value={form.merchantId}
            />
            {locked ? (
              <TextField
                disabled
                hint="Versions share one reference so their history stays together."
                label="Agreement reference"
                onChange={() => undefined}
                value={form.reference}
              />
            ) : (
              <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" role="status">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Agreement reference</p>
                {!form.merchantId ? (
                  <p className="font-semibold text-slate-600">Choose a merchant to see the reference format.</p>
                ) : prefix ? (
                  <>
                    <p className="font-mono text-base font-black text-slate-900">{prefix.referencePattern}…</p>
                    <p className="font-semibold text-slate-600">
                      Agreement reference will be generated when you save this draft. The number is assigned then, so it isn’t shown yet.
                    </p>
                    {prefixDraft === null ? (
                      prefix.locked ? (
                        <p className="text-xs text-slate-500">
                          {prefix.prefix} is already used in this partner’s references, so it stays the same.
                        </p>
                      ) : (
                        <button
                          className={`${textButton} justify-self-start`}
                          onClick={() => setPrefixDraft(prefix.prefix ?? prefix.suggestedPrefix)}
                          type="button"
                        >
                          Change prefix
                        </button>
                      )
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-40 flex-1">
                          <TextField
                            hint="2–12 letters and numbers. It can’t change once a reference uses it."
                            label="Reference prefix"
                            maxLength={12}
                            onChange={(value) => setPrefixDraft(normalizePrefix(value))}
                            value={prefixDraft}
                          />
                        </div>
                        <button className={secondaryButton} disabled={prefixSaving} onClick={() => setPrefixDraft(null)} type="button">
                          Cancel
                        </button>
                        <button className={primaryButton} disabled={prefixSaving} onClick={() => void savePrefix()} type="button">
                          {prefixSaving ? "Saving…" : "Save prefix"}
                        </button>
                      </div>
                    )}
                  </>
                ) : prefixError ? null : (
                  <p className="font-semibold text-slate-500">Loading reference format…</p>
                )}
                {prefixError ? (
                  <p className="text-xs font-bold text-[#a63c2e]" role="alert">
                    {prefixError}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-6">
            {defaultsState === "applied" && defaults ? (
              <Callout title="Default terms have been applied" tone="info">
                You can customise them for this agreement. Saving keeps this agreement’s own copy; later changes to the defaults
                won’t affect it. (Default terms revision {appliedRevision}.)
                {confirmRestore ? (
                  <span className="mt-2 flex flex-wrap items-center gap-2" role="alert">
                    <span className="font-black">Replace your edited commission and clauses with the defaults?</span>
                    <button className={textButton} onClick={() => setConfirmRestore(false)} type="button">
                      Keep my edits
                    </button>
                    <button className={textButton} onClick={restoreDefaults} type="button">
                      Replace with defaults
                    </button>
                  </span>
                ) : differsFromDefaults(form, defaults.terms) ? (
                  <button className={`${textButton} ml-1`} onClick={() => setConfirmRestore(true)} type="button">
                    Restore default terms
                  </button>
                ) : null}
              </Callout>
            ) : null}
            {defaultsState === "inactive" ? (
              <Callout tone="info">No default terms are in use yet. Enter the terms agreed with this partner.</Callout>
            ) : null}
            {defaultsState === "error" ? (
              <Callout tone="warning">The default terms couldn’t be loaded. Enter the terms agreed with this partner.</Callout>
            ) : null}
            <TermsSection title="Commission and duration">
              <div className="grid gap-2">
                <TextField
                  error={visible("partnerCommissionPercentage")}
                  hint={
                    form.partnerCommissionPercentage === null || Number.isNaN(form.partnerCommissionPercentage)
                      ? "The percentage of each sale the partner keeps."
                      : `The partner keeps ${form.partnerCommissionPercentage}%; MyPetLink receives ${myPetLinkShare(form.partnerCommissionPercentage)}%.`
                  }
                  inputMode="decimal"
                  label="Partner commission (%)"
                  max="100"
                  min="0"
                  onChange={(value) => change("partnerCommissionPercentage", value === "" ? null : Number(value))}
                  requirement="required"
                  step="0.01"
                  type="number"
                  value={form.partnerCommissionPercentage === null ? "" : String(form.partnerCommissionPercentage)}
                />
              </div>
              <TextField
                hint="For example: 12 months, renewing unless either side gives 30 days’ written notice."
                label="Duration and renewal terms"
                onChange={(value) => change("durationTerms", value || null)}
                requirement="approval"
                value={form.durationTerms ?? ""}
              />
              <DateField
                error={visible("effectiveFrom")}
                hint={form.effectiveFrom ? `Starts ${shortDate(form.effectiveFrom)}.` : "The first day the terms apply."}
                label="Effective start"
                onChange={(value) => {
                  const start = value ? startOfDayIso(value) : null;
                  change("effectiveFrom", start);
                  if (!endTouched) change("effectiveTo", suggestedEndIso(start, trialDays));
                }}
                requirement="approval"
                value={dateInputValue(form.effectiveFrom)}
              />
              <DateField
                error={visible("effectiveTo")}
                hint={
                  form.effectiveTo
                    ? `Runs to the end of ${shortDate(form.effectiveTo)}.${!endTouched && trialDays ? ` Suggested from the ${trialDays}-day trial, counting the start day as day 1.` : ""}`
                    : trialDays
                      ? `Pick the start date to suggest the end of the ${trialDays}-day trial, or leave blank if no end date was agreed.`
                      : "Leave blank if no end date was agreed."
                }
                label="Effective end"
                min={dateInputValue(form.effectiveFrom) || undefined}
                onChange={(value) => {
                  setEndTouched(true);
                  change("effectiveTo", value ? endOfDayIso(value) : null);
                }}
                requirement="optional"
                value={dateInputValue(form.effectiveTo)}
              />
            </TermsSection>

            <TermsSection title="Settlement and payment">
              <TextField
                hint="Record what was agreed, for example Monthly."
                label="Settlement frequency"
                list="consignment-settlement-suggestions"
                onChange={(value) => change("settlementFrequency", value || null)}
                requirement="approval"
                value={form.settlementFrequency ?? ""}
              />
              <datalist id="consignment-settlement-suggestions">
                <option value="Weekly" />
                <option value="Fortnightly" />
                <option value="Monthly" />
                <option value="Quarterly" />
              </datalist>
              <TextField
                error={visible("paymentDeadlineDays")}
                hint="Whole days, from 0 to 365."
                inputMode="numeric"
                label="Payment deadline (days)"
                max="365"
                min="0"
                onChange={(value) => change("paymentDeadlineDays", value === "" ? null : Number(value))}
                requirement="approval"
                step="1"
                type="number"
                value={form.paymentDeadlineDays === null ? "" : String(form.paymentDeadlineDays)}
              />
            </TermsSection>

            <TermsSection title="Discounts and returns">
              <TextAreaField
                hint="Whether the partner may discount, and by how much."
                label="Discount permissions"
                onChange={(value) => change("discountTerms", value || null)}
                requirement="approval"
                value={form.discountTerms ?? ""}
              />
              <TextAreaField
                hint="How and when unsold tags come back."
                label="Return terms"
                onChange={(value) => change("returnTerms", value || null)}
                requirement="approval"
                value={form.returnTerms ?? ""}
              />
            </TermsSection>

            <TermsSection title="Loss and damage">
              <div className="sm:col-span-2">
                <TextAreaField
                  error={visible("lossTerms")}
                  hint="Who is responsible for lost or damaged tags, and from when."
                  label="Loss and damage responsibility"
                  onChange={(value) => change("lossTerms", value || null)}
                  requirement="approval"
                  value={form.lossTerms ?? ""}
                />
              </div>
            </TermsSection>

            <TermsSection title="Signed partner agreement">
              <div className="sm:col-span-2">
                <Callout tone="info">
                  Approval inside MyPetLink is an internal check. It is not the partner’s signature. Record the reference of
                  the agreement the partner actually signed — leave it blank until it exists.
                </Callout>
              </div>
              <TextField
                error={visible("signedAgreementReference")}
                hint="For example, the signed document’s number or file name."
                label="Signed agreement reference"
                onChange={(value) => change("signedAgreementReference", value || null)}
                requirement="approval"
                value={form.signedAgreementReference ?? ""}
              />
              <TextField
                error={visible("externalTrackerReference")}
                hint="Where partner sales and settlement are reconciled. Keep customer details out."
                label="External tracker reference"
                onChange={(value) => change("externalTrackerReference", value || null)}
                requirement="approval"
                value={form.externalTrackerReference ?? ""}
              />
            </TermsSection>
          </div>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="wizard-review" className="grid gap-4">
            <div>
              <h3 className="text-base font-black text-slate-950" id="wizard-review">
                Review before saving
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {merchantName} · {isNew ? "reference generated when you save" : form.reference}
                {request.mode === "revision" ? ` · version ${request.agreement.version + 1}` : ""}
              </p>
            </div>
            {pending.length > 0 ? (
              <Callout title="Still to agree before approval" tone="warning">
                {pending.join(", ")}. You can save the draft now and complete these later.
              </Callout>
            ) : (
              <Callout title="Every term is recorded" tone="info">
                After saving, the draft can be approved. Approval is an internal check, not the partner’s signature.
              </Callout>
            )}
            <p className="text-xs font-semibold text-slate-500">
              {dirty
                ? "These changes aren’t saved yet. The agreement document only ever uses saved terms — save the draft before previewing or issuing it."
                : "The agreement document is generated from the saved terms on the agreement page."}
            </p>
            {saveError ? (
              <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
                {saveError} Your entries are kept.
              </div>
            ) : null}
            <AgreementTermsSummary agreement={form} />
          </section>
        ) : null}

        {step === 3 && saved ? (
          <section aria-labelledby="wizard-saved" className="grid gap-4" role="status">
            <h3 className="text-base font-black text-slate-950" id="wizard-saved">
              {saved.reference} v{saved.version} saved as a draft
            </h3>
            {saved.pendingTerms.length > 0 && saved.pendingTerms.every((t) => t === "Signed agreement reference" || t === "External tracker") ? (
              <Callout title="Next: issue the agreement for signature" tone="info">
                The commercial terms are complete. On the agreement page, preview and issue the agreement document, send it to
                the partner, then record their signed copy and its reference.
              </Callout>
            ) : saved.pendingTerms.length > 0 ? (
              <Callout title="Next: complete the remaining terms" tone="warning">
                Still pending: {saved.pendingTerms.join(", ")}. Edit the draft once these are agreed with the partner.
              </Callout>
            ) : canApprove ? (
              <Callout title="Next: approval" tone="info">
                Approve when you have checked the signed partner agreement ({saved.signedAgreementReference}). In Team Mode a
                different administrator must approve.
              </Callout>
            ) : (
              <Callout title="Next: approval" tone="info">
                An administrator with approval permission must review and approve this draft.
              </Callout>
            )}
          </section>
        ) : null}
      </div>
    </FormDialog>
  );
}

function TermsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0 sm:grid-cols-2">
      <legend className="float-left mb-1 w-full text-sm font-black uppercase tracking-wide text-slate-500 sm:col-span-2">{title}</legend>
      {children}
    </fieldset>
  );
}

