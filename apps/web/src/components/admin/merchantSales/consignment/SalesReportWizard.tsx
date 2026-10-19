"use client";

import { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { getMerchantListing, type AdminBranch } from "@/services/merchantDirectoryService";
import * as api from "@/services/adminConsignmentService";
import { primaryButton, secondaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import {
  clampedSalesPeriod,
  errorMessage,
  localDateTimeInput,
  nextSalesPeriod,
  recentSalesMonths,
  refundOriginOptions,
  reportingWindow,
  ringgit,
  salesPeriodKeyOf,
  salesPeriodLabel,
  salesReportMatches,
  type SalesPeriodKey,
} from "./model";
import { Callout, SelectField, TextAreaField, TextField, WorkflowStepper, textButton } from "./ui";

export type SalesReportRequest = { mode: "new"; agreementId?: string } | { mode: "edit"; report: api.SalesReport };

type Line = {
  key: string;
  productVariantId: string;
  lineType: "Sale" | "Refund";
  priceTermId: string; // "" = not chosen, "other" = a price no approved term matches
  unitNetPrice: string;
  quantity: string;
  /** Start of the report period the refunded sale was verified in. */
  refundOrigin: string;
  restockable: string;
  unsellable: string;
  sealedConfirmed: boolean;
  sealedEvidence: string;
  notes: string;
};

const steps = [
  { id: "period", label: "Partner and period" },
  { id: "lines", label: "Sales by SKU" },
  { id: "evidence", label: "Evidence and review" },
] as const;

const evidenceKinds: api.EvidenceKind[] = ["WhatsApp summary", "POS report", "Sales record photo", "Other"];

let lineCounter = 0;
function newLine(lineType: "Sale" | "Refund", productVariantId = ""): Line {
  lineCounter += 1;
  return { key: `line-${lineCounter}`, productVariantId, lineType, priceTermId: "", unitNetPrice: "", quantity: "",
    refundOrigin: "", restockable: "0", unsellable: "0", sealedConfirmed: false, sealedEvidence: "", notes: "" };
}

function fromReport(report: api.SalesReport): Line[] {
  // A report re-entered from evidence starts empty.
  if (report.lines.length === 0) return [newLine("Sale")];
  return report.lines.map((l) => {
    lineCounter += 1;
    return { key: `line-${lineCounter}`, productVariantId: l.productVariantId, lineType: l.lineType,
      priceTermId: l.priceTermId ?? "other", unitNetPrice: l.unitNetPrice.toFixed(2), quantity: String(l.quantity),
      refundOrigin: l.refundOfPeriodStart ?? "", restockable: String(l.restockableQuantity),
      unsellable: String(l.unsellableReturnedQuantity),
      // A line restocked before confirmation existed must be confirmed afresh, not carried over.
      sealedConfirmed: l.sealedReturnConfirmed, sealedEvidence: l.sealedReturnConfirmed ? (l.sealedReturnEvidence ?? "") : "",
      notes: l.notes ?? "" };
  });
}

const isMoney = (value: string) => /^\d{1,6}(\.\d{1,2})?$/.test(value.trim());
const isCount = (value: string, min: number) => /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= 10000;

/**
 * Enters a partner's sales report exactly as reported. Saving never posts
 * stock; only verification does, and only at approved prices.
 */
export function SalesReportWizard({
  context,
  request,
  onClose,
  onSaved,
}: {
  context: ConsignmentContext;
  request: SalesReportRequest;
  onClose: () => void;
  onSaved: (report: api.SalesReport, message: string) => void;
}) {
  const editing = request.mode === "edit" ? request.report : null;
  const correction = Boolean(editing?.supersedesReportId);
  const reportable = context.agreements.filter((a) => a.status !== "Draft");
  const initialAgreement = editing?.agreementId ?? (request.mode === "new" ? request.agreementId : undefined) ?? (reportable.length === 1 ? reportable[0].id : "");
  const [agreementId, setAgreementId] = useState(initialAgreement);
  const agreement = context.agreements.find((a) => a.id === agreementId) ?? null;
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [branchId, setBranchId] = useState(editing?.merchantBranchId ?? "");
  const initialPeriod: SalesPeriodKey = editing
    ? salesPeriodKeyOf(editing.periodStart)
    : nextSalesPeriod(context.positions?.find((p) => p.merchantBranchId === branchId)?.lastVerifiedPeriodEnd ?? null);
  const [period, setPeriod] = useState<SalesPeriodKey>(initialPeriod);
  const [reference, setReference] = useState(editing?.partnerReference ?? "");
  const [terms, setTerms] = useState<api.PriceTerm[] | null>(null);
  const [lines, setLines] = useState<Line[]>(() => (editing ? fromReport(editing) : [newLine("Sale")]));
  const [receivedAt, setReceivedAt] = useState(editing ? localDateTimeInput(new Date(editing.reportReceivedAt)) : localDateTimeInput(new Date()));
  const [evidenceLevel, setEvidenceLevel] = useState<api.EvidenceLevel>(editing?.evidenceLevel ?? "Summary");
  const [evidenceKind, setEvidenceKind] = useState<api.EvidenceKind>(editing?.evidenceKind ?? "WhatsApp summary");
  const [evidenceReference, setEvidenceReference] = useState(editing?.evidenceReference ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  // The draft an earlier attempt in this window saved, so a retry updates it instead of guessing.
  const [savedDraft, setSavedDraft] = useState<api.SalesReport | null>(null);
  const [partnerTerms, setPartnerTerms] = useState<api.PriceTerm[]>([]);
  const [branchReports, setBranchReports] = useState<api.SalesReport[]>([]);
  const merchantId = agreement?.merchantId;
  // The partner's other approved agreement versions: a refund keeps the price its sale was made at,
  // even when that sale was under an earlier version. This version's prices are loaded below.
  const partnerAgreementIds = context.agreements
    .filter((a) => a.merchantId === merchantId && a.status !== "Draft" && a.id !== agreementId)
    .map((a) => a.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!merchantId) return;
    let active = true;
    getMerchantListing(merchantId)
      .then((listing) => {
        if (!active) return;
        setBranches(listing.branches);
        setBranchId((current) => current || (listing.branches.filter((b) => b.isActive).length === 1 ? listing.branches.find((b) => b.isActive)!.id : ""));
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [merchantId]);

  useEffect(() => {
    if (!agreementId) return;
    let active = true;
    api
      .listPriceTerms(agreementId)
      .then((value) => {
        if (active) setTerms(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [agreementId]);

  useEffect(() => {
    if (!partnerAgreementIds) return;
    let active = true;
    Promise.all(partnerAgreementIds.split(",").map((id) => api.listPriceTerms(id)))
      .then((lists) => {
        if (active) setPartnerTerms(lists.flat());
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [partnerAgreementIds]);

  // Earlier report periods at this branch, which refunds refer to.
  useEffect(() => {
    if (!branchId) return;
    let active = true;
    api
      .listSalesReports(1, { branchId }, 100)
      .then((page) => {
        if (active) setBranchReports(page.items);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  const usableTerms = (terms ?? []).filter((t) => t.status !== "Withdrawn");
  const refundTerms = [...usableTerms, ...partnerTerms.filter((t) => t.status !== "Withdrawn" && partnerAgreementIds.split(",").includes(t.agreementId))];
  const skuNames = new Map<string, string>();
  for (const t of usableTerms) skuNames.set(t.productVariantId, t.sku);
  for (const p of context.positions ?? [])
    if (p.merchantBranchId === branchId) for (const s of p.skus) skuNames.set(s.productVariantId, s.sku);
  const skus = [...skuNames.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));

  const reportPeriod = clampedSalesPeriod(period, reportingWindow(agreement, context.agreements));
  const origins = refundOriginOptions(branchReports, branchId, reportPeriod);
  const originOf = (line: Line) => origins.find((o) => Date.parse(o.value) === Date.parse(line.refundOrigin)) ?? null;
  const termsFor = (line: Line) => {
    const origin = line.lineType === "Refund" ? originOf(line) : null;
    if (line.lineType === "Refund" && !origin) return [];
    const [start, end] = origin ? [Date.parse(origin.value), Date.parse(origin.end)] : [Date.parse(reportPeriod.start), Date.parse(reportPeriod.end)];
    return (line.lineType === "Refund" ? refundTerms : usableTerms).filter((t) => t.productVariantId === line.productVariantId
      && Date.parse(t.validFrom) < end && (!t.validToExclusive || Date.parse(t.validToExclusive) > start));
  };

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, ...patch };
      // Choosing an agreed price fills its amount; the operator never retypes an approved price.
      if (patch.priceTermId && patch.priceTermId !== "other") {
        const term = refundTerms.find((t) => t.id === patch.priceTermId);
        if (term) next.unitNetPrice = term.unitNetPrice.toFixed(2);
      }
      if (patch.productVariantId !== undefined || patch.refundOrigin !== undefined) next.priceTermId = "";
      return next;
    }));
  }

  const lineErrors = lines.map((l) => {
    if (!l.productVariantId) return "Choose the tag option.";
    if (!l.priceTermId) return "Choose the price.";
    if (!isMoney(l.unitNetPrice)) return "Enter the actual price in MYR.";
    if (!isCount(l.quantity, 1)) return "Enter a quantity of at least 1.";
    if (l.lineType === "Refund") {
      if (!originOf(l)) return "Choose the period of the refunded sale.";
      if (!isCount(l.restockable, 0) || !isCount(l.unsellable, 0)) return "Enter returned quantities (0 if none).";
      if (Number(l.restockable) + Number(l.unsellable) > Number(l.quantity)) return "Returned packages can’t exceed the refunded quantity.";
      if (Number(l.restockable) > 0 && (!l.sealedConfirmed || l.sealedEvidence.trim().length < 5))
        return "Confirm the packages going back on the shelf came back sealed, and say how you know.";
    }
    return "";
  });
  const periodErrors = {
    agreement: agreementId ? "" : "Choose the agreement.",
    branch: branchId ? "" : "Choose the branch.",
    reference: reference.trim() ? "" : "Enter the partner’s report reference.",
  };
  const evidenceError = evidenceReference.trim().length >= 5 ? "" : "Describe where the report came from (at least 5 characters).";
  const totals = lines.reduce(
    (t, l) => {
      const qty = Number(l.quantity) || 0;
      const value = (Number(l.unitNetPrice) || 0) * qty;
      return l.lineType === "Sale"
        ? { ...t, sold: t.sold + qty, value: t.value + value }
        : { ...t, refunded: t.refunded + qty, value: t.value - value };
    },
    { sold: 0, refunded: 0, value: 0 }
  );
  const unapproved = lines.some((l) => l.priceTermId === "other" || refundTerms.find((t) => t.id === l.priceTermId)?.status === "Draft");

  function next() {
    const blocking = step === 0 ? Object.values(periodErrors).some(Boolean) : lineErrors.some(Boolean);
    if (blocking) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => s + 1);
  }

  async function save(record: boolean) {
    if (record && evidenceError) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const input: api.SalesReportInput = {
        agreementId, merchantBranchId: branchId, periodMonth: period.month, half: period.half,
        partnerReference: reference.trim(), reportReceivedAt: new Date(receivedAt).toISOString(), evidenceLevel, evidenceKind,
        evidenceReference: evidenceReference.trim() || null, notes: notes.trim() || null, idempotencyKey: editing ? undefined : idempotencyKey,
        lines: lines.map((l) => ({
          productVariantId: l.productVariantId, lineType: l.lineType, priceTermId: l.priceTermId === "other" ? null : l.priceTermId,
          unitNetPrice: Number(l.unitNetPrice), quantity: Number(l.quantity), notes: l.notes.trim() || null,
          ...(l.lineType === "Refund"
            ? { refundOfPeriodStart: originOf(l)?.value ?? l.refundOrigin,
                restockableQuantity: Number(l.restockable), unsellableReturnedQuantity: Number(l.unsellable),
                ...(Number(l.restockable) > 0 ? { sealedReturnConfirmed: l.sealedConfirmed, sealedReturnEvidence: l.sealedEvidence.trim() } : {}) }
            : {}),
        })),
      };
      const recordedMessage = "Sales report recorded. It stays unverified until you check it against the evidence.";
      let saved: api.SalesReport;
      const known = savedDraft ?? editing;
      if (known) {
        // Retry from what the server holds now: an earlier attempt may have gone through after its reply was lost.
        const latest = await api.getSalesReport(known.id);
        if (latest.status !== "Draft") {
          if (latest.status === "Recorded" && salesReportMatches(latest, input)) {
            onSaved(latest, recordedMessage);
            return;
          }
          throw new Error("This report was already recorded with different values, so nothing was changed. Close this window and open the report to check it.");
        }
        saved = await api.saveSalesReport(input, latest);
      } else {
        // The same submission reference makes a retry of a lost reply safe: the server returns what it
        // saved only when it matches these values, updates its own unshared draft, or refuses clearly.
        saved = await api.saveSalesReport(input);
      }
      setSavedDraft(saved);
      if (record) saved = await api.salesReportAction(saved, "record");
      onSaved(saved, record ? recordedMessage : "Sales report draft saved.");
    } catch (e) {
      setError(`${errorMessage(e)} Your entries are kept.`);
    } finally {
      setSaving(false);
    }
  }

  const stages = steps.map((s, index) => ({
    id: s.id, label: s.label,
    state: (index < step ? "done" : index === step ? "current" : "upcoming") as "done" | "current" | "upcoming",
  }));
  const periodText = salesPeriodLabel(reportPeriod.start, reportPeriod.end);

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {step > 0 ? (
          <button className={secondaryButton} disabled={saving} onClick={() => setStep((s) => s - 1)} type="button">
            Back
          </button>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button className={secondaryButton} disabled={saving} onClick={onClose} type="button">
          Cancel
        </button>
        {step < 2 ? (
          <button className={primaryButton} onClick={next} type="button">
            Continue
          </button>
        ) : (
          <>
            <button className={secondaryButton} disabled={saving} onClick={() => void save(false)} type="button">
              Save draft
            </button>
            <button className={primaryButton} disabled={saving} onClick={() => void save(true)} type="button">
              {saving ? "Saving…" : "Record as unverified"}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <FormDialog
      closeOnBackdrop={false}
      description="Enter the partner’s report exactly as they sent it. Recording it changes no stock; only verification does."
      eyebrow="Sales report"
      footer={footer}
      maxWidthClassName="sm:max-w-4xl"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
      open
      title={editing ? (correction ? `Correct ${editing.partnerReference} (version ${editing.version})` : "Edit sales report draft") : "Record sales report"}
    >
      <div className="grid gap-5">
        <WorkflowStepper label="Sales report steps" stages={stages} />
        {error ? (
          <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
            {error}
          </div>
        ) : null}

        {step === 0 ? (
          <section className="grid gap-4 sm:grid-cols-2">
            <SelectField
              disabled={correction}
              emptyLabel={reportable.length ? "Choose agreement" : "No approved agreements"}
              error={showErrors ? periodErrors.agreement || undefined : undefined}
              label="Agreement"
              onChange={(value) => {
                // Re-choosing the same agreement keeps its loaded prices and branch.
                if (value === agreementId) return;
                setAgreementId(value);
                setBranchId("");
                setTerms(null);
              }}
              options={reportable.map((a) => ({ value: a.id, label: `${a.merchantName} · ${a.reference} v${a.version}` }))}
              requirement="required"
              value={agreementId}
            />
            <SelectField
              disabled={correction || !agreementId}
              emptyLabel={agreementId ? "Choose branch" : "Choose an agreement first"}
              error={showErrors ? periodErrors.branch || undefined : undefined}
              label="Branch"
              onChange={setBranchId}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              requirement="required"
              value={branchId}
            />
            <SelectField
              disabled={correction}
              emptyLabel="Choose month"
              label="Sales month"
              onChange={(value) => setPeriod((p) => ({ ...p, month: value }))}
              options={withValue(recentSalesMonths(), period.month)}
              requirement="required"
              value={period.month}
            />
            <fieldset className="grid gap-1.5">
              <legend className="text-sm font-black text-slate-800">Half of the month</legend>
              <div className="flex gap-2">
                {([1, 2] as const).map((half) => (
                  <label
                    className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-bold ${
                      period.half === half ? "border-pet-teal bg-[#f0f7ff] text-pet-teal" : "border-slate-200 text-slate-700"
                    } ${correction ? "cursor-not-allowed opacity-60" : ""}`}
                    key={half}
                  >
                    <input
                      checked={period.half === half}
                      className="sr-only"
                      disabled={correction}
                      name="sales-half"
                      onChange={() => setPeriod((p) => ({ ...p, half }))}
                      type="radio"
                    />
                    {half === 1 ? "1st – 15th" : "16th – month end"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <TextField
                disabled={correction}
                error={showErrors ? periodErrors.reference || undefined : undefined}
                hint={correction ? "A correction keeps the original reference and period." : `The partner’s own reference if they gave one, otherwise for example ${period.month}-${period.half === 1 ? "A" : "B"}.`}
                label="Partner report reference"
                maxLength={100}
                onChange={setReference}
                requirement="required"
                value={reference}
              />
            </div>
            <p className="text-sm font-semibold text-slate-600 sm:col-span-2">Sales period: {periodText}</p>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="grid gap-3" aria-label="Sales lines">
            {terms !== null && usableTerms.filter((t) => t.status === "Approved").length === 0 ? (
              <Callout tone="warning" title="No approved selling prices for this agreement">
                You can record the report as the partner sent it, but it can’t be verified until its prices are approved on the
                agreement.
              </Callout>
            ) : null}
            {lines.map((line, index) => {
              const options = termsFor(line);
              const err = showErrors ? lineErrors[index] : "";
              return (
                <div className={`grid gap-3 rounded-xl border p-3 ${line.lineType === "Refund" ? "border-[#f6dfae] bg-[#fdf6e7]" : "border-slate-200 bg-slate-50"}`} key={line.key}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900">
                      {line.lineType === "Sale" ? "Sale" : "Customer refund"} · line {index + 1}
                    </p>
                    {lines.length > 1 ? (
                      <button className={textButton} onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} type="button">
                        Remove line {index + 1}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_8rem_7rem]">
                    <SelectField
                      emptyLabel={skus.length ? "Choose tag option" : "No tag options for this partner"}
                      label={`Tag option (line ${index + 1})`}
                      onChange={(value) => updateLine(line.key, { productVariantId: value })}
                      options={skus}
                      value={line.productVariantId}
                    />
                    <SelectField
                      disabled={!line.productVariantId}
                      emptyLabel="Choose price"
                      label={`Price (line ${index + 1})`}
                      onChange={(value) => updateLine(line.key, { priceTermId: value })}
                      options={[
                        ...options.map((t) => ({
                          value: t.id,
                          label: `${t.kind === "Standard" ? "Standard" : t.name} · ${ringgit(t.unitNetPrice)}${t.status === "Draft" ? " (not approved yet)" : ""}`,
                        })),
                        { value: "other", label: "Another price (not approved)" },
                      ]}
                      value={line.priceTermId}
                    />
                    <TextField
                      disabled={line.priceTermId !== "other"}
                      inputMode="decimal"
                      label={`Unit price RM (line ${index + 1})`}
                      onChange={(value) => updateLine(line.key, { unitNetPrice: value })}
                      value={line.unitNetPrice}
                    />
                    <TextField
                      inputMode="numeric"
                      label={`${line.lineType === "Sale" ? "Sold" : "Refunded"} (line ${index + 1})`}
                      onChange={(value) => updateLine(line.key, { quantity: value })}
                      value={line.quantity}
                    />
                  </div>
                  {line.lineType === "Refund" ? (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
                      <SelectField
                        emptyLabel={branchId ? "Choose the sale’s period" : "Choose a branch first"}
                        hint="The report the refunded sale was in. Its price list applies, even under an earlier agreement version."
                        label={`Original sale period (line ${index + 1})`}
                        onChange={(value) => updateLine(line.key, { refundOrigin: value })}
                        options={origins.map((o) => ({ value: o.value, label: o.label }))}
                        value={originOf(line)?.value ?? ""}
                      />
                      <TextField
                        hint="Sealed, unopened, back on the shelf."
                        inputMode="numeric"
                        label={`Restockable (line ${index + 1})`}
                        onChange={(value) => updateLine(line.key, { restockable: value })}
                        value={line.restockable}
                      />
                      <TextField
                        hint="Opened, damaged or activated, back at the shop."
                        inputMode="numeric"
                        label={`Unsellable (line ${index + 1})`}
                        onChange={(value) => updateLine(line.key, { unsellable: value })}
                        value={line.unsellable}
                      />
                      {Number(line.restockable) > 0 ? (
                        <div className="grid gap-2 rounded-lg border border-[#f6dfae] bg-white p-3 sm:col-span-3">
                          <label className="flex items-start gap-2 text-sm font-bold text-slate-800">
                            <input
                              checked={line.sealedConfirmed}
                              className="mt-0.5 h-4 w-4"
                              onChange={(e) => updateLine(line.key, { sealedConfirmed: e.target.checked })}
                              type="checkbox"
                            />
                            The {line.restockable} restocked {Number(line.restockable) === 1 ? "package" : "packages"} came back sealed and unopened
                          </label>
                          <TextField
                            hint="For example: shop photo of the intact seal, 18 Oct. Restocked tags go back on sale, so check this."
                            label={`How you know (line ${index + 1})`}
                            maxLength={300}
                            onChange={(value) => updateLine(line.key, { sealedEvidence: value })}
                            requirement="required"
                            value={line.sealedEvidence}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {line.priceTermId === "other" ? (
                    <p className="text-xs font-bold text-[#a63c2e]">
                      This price isn’t approved. The report can be recorded as reported, but it must be corrected — or the
                      promotion approved first — before it can be verified.
                    </p>
                  ) : null}
                  {err ? (
                    <p className="text-xs font-bold text-[#a63c2e]" role="alert">
                      {err}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button className={textButton} onClick={() => setLines((ls) => [...ls, newLine("Sale")])} type="button">
                + Add sale line
              </button>
              <button className={textButton} onClick={() => setLines((ls) => [...ls, newLine("Refund")])} type="button">
                + Add refund line
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {totals.sold} sold · {totals.refunded} refunded · net {ringgit(totals.value)}
            </p>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Report received" onChange={setReceivedAt} requirement="required" type="datetime-local" value={receivedAt} />
              <SelectField
                emptyLabel="Choose how it was sent"
                label="Sent as"
                onChange={(value) => setEvidenceKind(value as api.EvidenceKind)}
                options={evidenceKinds.map((k) => ({ value: k, label: k }))}
                requirement="required"
                value={evidenceKind}
              />
              <fieldset className="grid gap-1.5 sm:col-span-2">
                <legend className="text-sm font-black text-slate-800">Evidence level</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["Summary", "Documented"] as const).map((level) => (
                    <label
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
                        evidenceLevel === level ? "border-pet-teal bg-[#f0f7ff]" : "border-slate-200"
                      }`}
                      key={level}
                    >
                      <input checked={evidenceLevel === level} className="mt-1 h-4 w-4" name="evidence-level" onChange={() => setEvidenceLevel(level)} type="radio" />
                      <span>
                        <span className="block font-black text-slate-900">{level === "Summary" ? "Summary only" : "Documented"}</span>
                        <span className="block text-xs leading-5 text-slate-500">
                          {level === "Summary"
                            ? "A WhatsApp or written summary. Verified now, corroborated by the next monthly stocktake."
                            : "A POS report or photo of the sales records that shows each SKU."}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="sm:col-span-2">
                <TextField
                  error={showErrors ? evidenceError || undefined : undefined}
                  hint="Where to find it later, for example: WhatsApp from the shop owner, 16 Oct 2026 9:04 pm. Exclude customer details."
                  label="Evidence reference"
                  onChange={setEvidenceReference}
                  requirement="required"
                  value={evidenceReference}
                />
              </div>
              <div className="sm:col-span-2">
                <TextAreaField label="Notes" onChange={setNotes} requirement="optional" value={notes} />
              </div>
            </div>
            <Callout tone="info" title="Recording doesn’t move stock or money">
              {agreement?.merchantName} · {periodText}: {totals.sold} sold, {totals.refunded} refunded, net {ringgit(totals.value)}. The
              report stays unverified until you check it against the evidence. No invoice, payment or commission is created.
            </Callout>
            {unapproved ? (
              <Callout tone="warning">Some lines use a price that isn’t approved, so this report can’t be verified as it stands.</Callout>
            ) : null}
          </section>
        ) : null}
      </div>
    </FormDialog>
  );
}

function withValue(options: { value: string; label: string }[], value: string) {
  return options.some((o) => o.value === value) ? options : [{ value, label: value }, ...options];
}

