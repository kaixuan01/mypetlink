import type { AdminStatusTone } from "@/components/admin/AdminStatus";
import type * as api from "@/services/adminConsignmentService";
import { shortDate } from "../shared";

// Presentation rules for the Consignment workspace. Nothing here decides a
// business rule: the server still validates every save, approval and custody
// action. These helpers only describe the records it returned.

export type ConsignmentView = "overview" | "agreements" | "custody" | "sales" | "reconciliation" | "settings";

export const consignmentViews: { id: ConsignmentView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "agreements", label: "Agreements" },
  { id: "custody", label: "Dispatches" },
  { id: "sales", label: "Sales reports" },
  { id: "reconciliation", label: "Stocktake & reconciliation" },
  { id: "settings", label: "Settings" },
];

export function isConsignmentView(value: string | null): value is ConsignmentView {
  return consignmentViews.some((view) => view.id === value);
}

/** The largest page the list endpoints accept. Summaries only use complete sets. */
export const SUMMARY_PAGE_SIZE = 100;
export const LIST_PAGE_SIZE = 20;

// --- Labels ------------------------------------------------------------------

const labels: Record<string, string> = {
  ReviewRequired: "Receiving review required",
  Unconfirmed: "Not yet confirmed",
  Good: "Confirmed good",
  Damaged: "Damaged; under review",
  Missing: "Missing; under review",
  Returned: "Physical return reviewed",
  "receiving-unit": "Unit receiving finding",
  receive: "Partner receipt recorded",
  Reserved: "Reserved",
  Dispatched: "Dispatched",
  Received: "Received",
  Cancelled: "Cancelled",
  ReturnedQuarantine: "Return inspection",
  Released: "Released",
  ExternalHandover: "Customer handover recorded",
  NeedsReview: "Needs review",
  "external-handover": "Customer handover reference recorded",
  reserved: "Stock reserved",
  dispatched: "Stock dispatched",
  received: "Partner receipt acknowledged",
  cancelled: "Reservation cancelled",
  return: "Return received for inspection",
  release: "Inspected return released",
  WrittenOff: "Written off; unavailable",
  "write-off": "Failed return written off",
  "record-discrepancy": "Receiving discrepancy recorded",
  "resolve-discrepancy": "Receiving discrepancy resolved",
  "correct-handover": "External handover corrected",
  "reverse-handover": "External handover reversed",
  Draft: "Draft",
  Active: "Active",
  Closed: "Closed",
};

export function statusLabel(value: string): string {
  return labels[value] ?? value;
}

export function dispatchStatusLabel(value: string): string {
  return value === "Received" ? "Receiving complete" : statusLabel(value);
}

export function agreementTone(status: string): AdminStatusTone {
  return status === "Active" ? "positive" : status === "Draft" ? "warning" : "neutral";
}

export function dispatchTone(status: string): AdminStatusTone {
  switch (status) {
    case "Reserved":
      return "info";
    case "Dispatched":
      return "warning";
    case "Received":
      return "positive";
    default:
      return "neutral";
  }
}

/** MyPetLink's share is whatever the partner does not keep, to two places. */
export function myPetLinkShare(partnerPercentage: number): string {
  return ((10000 - Math.round(partnerPercentage * 100)) / 100).toFixed(2);
}

export function percentLabel(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

export function effectivePeriod(a: Pick<api.Agreement, "effectiveFrom" | "effectiveTo">): string {
  if (!a.effectiveFrom) return "Start date not agreed";
  return a.effectiveTo
    ? `${shortDate(a.effectiveFrom)} – ${shortDate(a.effectiveTo)}`
    : `From ${shortDate(a.effectiveFrom)} · no end date`;
}

export function unitReference(id: string): string {
  return "CU-" + id.replaceAll("-", "").toUpperCase();
}

// --- Next steps --------------------------------------------------------------

export type NextStep = { label: string; detail: string; tone: AdminStatusTone };

export function agreementNextStep(a: api.Agreement): NextStep {
  if (a.status === "Draft") {
    return a.pendingTerms.length > 0
      ? {
          label: "Complete terms",
          detail: `${a.pendingTerms.length} ${a.pendingTerms.length === 1 ? "term" : "terms"} still to agree`,
          tone: "warning",
        }
      : { label: "Ready for approval", detail: "Terms and signed evidence recorded", tone: "info" };
  }
  if (a.status === "Active") {
    return { label: "Reserve stock", detail: "Approved for stock reservation", tone: "positive" };
  }
  return { label: "No action needed", detail: "This version is closed", tone: "neutral" };
}

export function dispatchNextStep(d: api.ConsignmentDispatch): NextStep {
  if (d.status === "Cancelled") {
    return { label: "No action needed", detail: "Reservation cancelled", tone: "neutral" };
  }
  if (d.status === "Reserved") {
    return { label: "Confirm dispatch", detail: "Reserved tags are waiting to be sent", tone: "info" };
  }
  if (d.hasOpenDiscrepancy) {
    return { label: "Resolve discrepancy", detail: "Damaged or missing units are under review", tone: "critical" };
  }
  if (d.status === "Dispatched") {
    return { label: "Record partner receipt", detail: "Waiting for the partner’s signed count", tone: "warning" };
  }
  if (d.activatedWithoutExternalReference > 0) {
    return {
      label: "Record customer handovers",
      detail: `${d.activatedWithoutExternalReference} activated ${d.activatedWithoutExternalReference === 1 ? "tag needs" : "tags need"} a tracker reference`,
      tone: "warning",
    };
  }
  if (d.returnedQuarantine > 0) {
    return { label: "Inspect returns", detail: `${d.returnedQuarantine} returned ${d.returnedQuarantine === 1 ? "tag awaits" : "tags await"} inspection`, tone: "info" };
  }
  if (d.partnerHeld > 0) {
    return { label: "Reconcile with tracker", detail: `${d.partnerHeld} ${d.partnerHeld === 1 ? "tag" : "tags"} with the partner`, tone: "info" };
  }
  return { label: "Fully reconciled", detail: "No tags remain with the partner", tone: "positive" };
}

export type ReceivingProgress = { confirmed: number; total: number; unresolved: number };

/** Receiving only applies once stock has left; reservations have none. */
export function receivingProgress(d: api.ConsignmentDispatch): ReceivingProgress | null {
  if (d.status === "Reserved" || d.status === "Cancelled") return null;
  const sent = d.units.filter((u) => u.status !== "Reserved");
  return {
    total: sent.length,
    confirmed: sent.filter((u) => u.receivingState !== "Unconfirmed").length,
    unresolved: unresolvedUnits(d),
  };
}

export function unresolvedUnits(d: api.ConsignmentDispatch): number {
  return d.units.filter((u) => ["Damaged", "Missing", "ReviewRequired"].includes(u.receivingState)).length;
}

// --- Workflow ----------------------------------------------------------------

export type StageState = "done" | "current" | "upcoming";
export type Stage = { id: string; label: string; state: StageState };

function stagesFrom(steps: { id: string; label: string; done: boolean }[]): Stage[] {
  const current = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: step.done ? "done" : index === current ? "current" : "upcoming",
  }));
}

const signedTerm = "Signed agreement reference";

/**
 * Draft → Signed evidence → Approval → Stock reservation → Dispatch →
 * Partner receipt → Reconciliation. Later stages read the agreement's own
 * dispatches; while those are loading they simply stay upcoming.
 */
export function agreementStages(a: api.Agreement, dispatches: api.ConsignmentDispatch[] | null): Stage[] {
  const approved = a.status === "Active" || (a.status === "Closed" && Boolean(a.approvalReviewMode));
  const live = (dispatches ?? []).filter((d) => d.status !== "Cancelled");
  return stagesFrom([
    { id: "draft", label: "Draft terms", done: a.status !== "Draft" || a.pendingTerms.every((t) => t === signedTerm) },
    { id: "signed", label: "Signed evidence", done: Boolean(a.signedAgreementReference?.trim()) },
    { id: "approval", label: "Approval", done: approved },
    { id: "reservation", label: "Stock reservation", done: approved && live.length > 0 },
    { id: "dispatch", label: "Dispatch", done: live.some((d) => d.status !== "Reserved") },
    { id: "receipt", label: "Partner receipt", done: live.some((d) => d.status === "Received") },
    { id: "reconciliation", label: "Reconciliation & returns", done: a.status === "Closed" && approved },
  ]);
}

export function dispatchStages(d: api.ConsignmentDispatch): Stage[] {
  return stagesFrom([
    { id: "reserved", label: "Reserved", done: true },
    { id: "dispatched", label: "Dispatched", done: d.status === "Dispatched" || d.status === "Received" },
    { id: "receipt", label: "Partner receipt", done: d.status === "Received" && !d.hasOpenDiscrepancy },
    {
      id: "reconciliation",
      label: "Reconciliation",
      done: d.status === "Received" && d.partnerHeld === 0 && d.returnedQuarantine === 0 && d.activatedWithoutExternalReference === 0,
    },
  ]);
}

// --- Overview ----------------------------------------------------------------

type Page<T> = { items: T[]; total: number };

/** A count, or null when the loaded records don't cover every record. */
export type Metric = number | null;

export type ConsignmentSummary = {
  agreementsComplete: boolean;
  dispatchesComplete: boolean;
  activeAgreements: Metric;
  draftsReady: Metric;
  draftsIncomplete: Metric;
  tagsWithPartners: Metric;
  awaitingDispatch: Metric;
  awaitingReceipt: Metric;
  openDiscrepancies: Metric;
  returnsAwaitingInspection: Metric;
  handoversNeeded: Metric;
};

/**
 * Totals are only reported from complete sets. A partial page would quietly
 * under-count, so beyond one summary page a metric is shown as unavailable.
 */
export function summarise(
  agreements: Page<api.Agreement> | null,
  dispatches: Page<api.ConsignmentDispatch> | null
): ConsignmentSummary {
  const agreementsComplete = Boolean(agreements && agreements.items.length >= agreements.total);
  const dispatchesComplete = Boolean(dispatches && dispatches.items.length >= dispatches.total);
  const a = agreementsComplete ? agreements!.items : null;
  const d = dispatchesComplete ? dispatches!.items : null;
  const count = <T,>(items: T[] | null, test: (item: T) => boolean) => (items ? items.filter(test).length : null);
  const sum = (items: api.ConsignmentDispatch[] | null, pick: (item: api.ConsignmentDispatch) => number) =>
    items ? items.reduce((total, item) => total + pick(item), 0) : null;
  return {
    agreementsComplete,
    dispatchesComplete,
    activeAgreements: count(a, (x) => x.status === "Active"),
    draftsReady: count(a, (x) => x.status === "Draft" && x.pendingTerms.length === 0),
    draftsIncomplete: count(a, (x) => x.status === "Draft" && x.pendingTerms.length > 0),
    tagsWithPartners: sum(d, (x) => x.partnerHeld),
    awaitingDispatch: count(d, (x) => x.status === "Reserved"),
    awaitingReceipt: count(d, (x) => x.status === "Dispatched" && !x.hasOpenDiscrepancy),
    openDiscrepancies: count(d, (x) => x.hasOpenDiscrepancy),
    returnsAwaitingInspection: sum(d, (x) => (x.status === "Cancelled" ? 0 : x.returnedQuarantine)),
    handoversNeeded: sum(d, (x) => x.activatedWithoutExternalReference),
  };
}

// --- Agreement form ----------------------------------------------------------

export const emptyAgreement: api.AgreementInput = {
  merchantId: "",
  reference: "",
  partnerCommissionPercentage: null,
  effectiveFrom: null,
  effectiveTo: null,
  durationTerms: null,
  settlementFrequency: null,
  paymentDeadlineDays: null,
  discountTerms: null,
  returnTerms: null,
  lossTerms: null,
  signedAgreementReference: null,
  externalTrackerReference: null,
};

export function agreementInputFrom(a: api.Agreement, revision: boolean): api.AgreementInput {
  return {
    merchantId: a.merchantId,
    reference: a.reference,
    partnerCommissionPercentage: a.partnerCommissionPercentage,
    effectiveFrom: a.effectiveFrom,
    effectiveTo: a.effectiveTo,
    durationTerms: a.durationTerms,
    settlementFrequency: a.settlementFrequency,
    paymentDeadlineDays: a.paymentDeadlineDays,
    discountTerms: a.discountTerms,
    returnTerms: a.returnTerms,
    lossTerms: a.lossTerms,
    signedAgreementReference: revision ? null : a.signedAgreementReference,
    externalTrackerReference: a.externalTrackerReference,
    supersedesAgreementId: revision ? a.id : (a.supersedesAgreementId ?? null),
  };
}

export type AgreementErrors = Partial<Record<keyof api.AgreementInput, string>>;

const textTerms = [
  "durationTerms",
  "settlementFrequency",
  "discountTerms",
  "returnTerms",
  "lossTerms",
  "signedAgreementReference",
  "externalTrackerReference",
] as const;

/** Mirrors the server's save checks so mistakes show beside the field. */
export function validateAgreement(form: api.AgreementInput): AgreementErrors {
  const errors: AgreementErrors = {};
  if (!form.merchantId) errors.merchantId = "Choose the partner merchant.";
  // A new agreement's reference is assigned on save; an existing one is only ever echoed back.
  if (form.reference.trim().length > 100) errors.reference = "Use 100 characters or fewer.";
  const rate = form.partnerCommissionPercentage;
  if (rate === null || Number.isNaN(rate)) errors.partnerCommissionPercentage = "Enter the partner commission agreed for this version.";
  else if (rate < 0 || rate > 100) errors.partnerCommissionPercentage = "Use a percentage from 0 to 100.";
  else if (Math.round(rate * 100) / 100 !== rate) errors.partnerCommissionPercentage = "Use no more than two decimal places.";
  const days = form.paymentDeadlineDays;
  if (days !== null && (Number.isNaN(days) || !Number.isInteger(days) || days < 0 || days > 365)) {
    errors.paymentDeadlineDays = "Use a whole number of days from 0 to 365.";
  }
  if (form.effectiveTo && !form.effectiveFrom) errors.effectiveFrom = "Add the start date before an end date.";
  else if (form.effectiveTo && form.effectiveFrom && Date.parse(form.effectiveTo) <= Date.parse(form.effectiveFrom)) {
    errors.effectiveTo = "The end date must be after the start date.";
  }
  for (const key of textTerms) {
    if ((form[key]?.length ?? 0) > 2000) errors[key] = "Use 2,000 characters or fewer.";
  }
  return errors;
}

/** The terms the server will still list as pending after this save. */
export function pendingTermsFor(form: api.AgreementInput): string[] {
  const pending: string[] = [];
  if (!form.effectiveFrom) pending.push("Effective start");
  const text: [string, string | null][] = [
    ["Duration", form.durationTerms],
    ["Settlement frequency", form.settlementFrequency],
    ["Discount permissions", form.discountTerms],
    ["Return terms", form.returnTerms],
    ["Loss terms", form.lossTerms],
    [signedTerm, form.signedAgreementReference],
    ["External tracker", form.externalTrackerReference],
  ];
  for (const [name, value] of text) if (!value?.trim()) pending.push(name);
  if (form.paymentDeadlineDays === null) pending.push("Payment deadline");
  return pending;
}

// --- Dates -------------------------------------------------------------------

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM-DD" in the operator's own time zone, for a date input. */
export function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDay(value: string, hours: number, minutes: number, seconds: number, ms: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hours, minutes, seconds, ms).toISOString();
}

/** An agreement starts at the beginning of its first day. */
export function startOfDayIso(value: string): string | null {
  return localDay(value, 0, 0, 0, 0);
}

/** An agreement runs to the end of its last day, so that day still counts. */
export function endOfDayIso(value: string): string | null {
  return localDay(value, 23, 59, 59, 999);
}

/** Exports take an exclusive end, so "through" a day means the next midnight. */
export function dayAfterIso(value: string): string | null {
  const start = startOfDayIso(value);
  if (!start) return null;
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export function localDateTimeInput(value: Date): string {
  return `${dateInputValue(value.toISOString())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "We couldn't complete this action. Please try again.";
}

// --- Sales periods (Malaysia time) ----------------------------------------------

const MALAYSIA_OFFSET_MINUTES = 8 * 60;

function malaysiaParts(iso: string) {
  const shifted = new Date(Date.parse(iso) + MALAYSIA_OFFSET_MINUTES * 60000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1–15 Oct 2026" or "16–31 Oct 2026", from a period's start and exclusive end. */
export function salesPeriodLabel(startIso: string, endExclusiveIso: string): string {
  const start = malaysiaParts(startIso);
  const last = malaysiaParts(new Date(Date.parse(endExclusiveIso) - 1).toISOString());
  return `${start.day}–${last.day} ${monthNames[last.month - 1]} ${last.year}`;
}

export type SalesPeriodKey = { month: string; half: 1 | 2 };

/** The canonical start of a half-month period, as an ISO instant at midnight Malaysia time. */
export function salesPeriodStartIso({ month, half }: SalesPeriodKey): string {
  return `${month}-${half === 1 ? "01" : "16"}T00:00:00+08:00`;
}

function nextMonthKey(month: string): SalesPeriodKey {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, half: 1 };
}

/**
 * A report's period as it is saved: the half-month, cut where the agreement version
 * starts or ends inside it (a renewal on the 10th starts a period on the 10th).
 */
export function clampedSalesPeriod(
  key: SalesPeriodKey,
  agreement?: { effectiveFrom: string | null; effectiveTo: string | null } | null
): { start: string; end: string } {
  const start = salesPeriodStartIso(key);
  const end = salesPeriodStartIso(key.half === 1 ? { month: key.month, half: 2 } : nextMonthKey(key.month));
  const from = agreement?.effectiveFrom ? Date.parse(agreement.effectiveFrom) : Number.NEGATIVE_INFINITY;
  const to = agreement?.effectiveTo ? Date.parse(agreement.effectiveTo) : Number.POSITIVE_INFINITY;
  const s = Math.max(Date.parse(start), from);
  const e = Math.min(Date.parse(end), to);
  return s < e ? { start: new Date(s).toISOString(), end: new Date(e).toISOString() } : { start, end };
}

/**
 * The dates a report under this agreement version can cover: its own start, and its end or the
 * start of a later approved version of the same agreement, whichever comes first.
 */
export function reportingWindow(
  agreement: { id: string; merchantId: string; reference: string; version: number; effectiveFrom: string | null; effectiveTo: string | null } | null,
  agreements: { merchantId: string; reference: string; version: number; status: string; effectiveFrom: string | null }[]
): { effectiveFrom: string | null; effectiveTo: string | null } | null {
  if (!agreement) return null;
  const successorStarts = agreements
    .filter((a) => a.merchantId === agreement.merchantId && a.reference === agreement.reference && a.version > agreement.version
      && a.status !== "Draft" && a.effectiveFrom)
    .map((a) => Date.parse(a.effectiveFrom!));
  const ends = [...successorStarts, ...(agreement.effectiveTo ? [Date.parse(agreement.effectiveTo)] : [])];
  return { effectiveFrom: agreement.effectiveFrom, effectiveTo: ends.length ? new Date(Math.min(...ends)).toISOString() : null };
}

export type RefundOrigin = { value: string; label: string; end: string };

/**
 * The sales periods a refund can refer to: this report's own period and every earlier
 * report period at the branch, newest first. Refunds name a real report period, so a
 * renewal mid-month is handled like any other period.
 */
export function refundOriginOptions(reports: api.SalesReport[], branchId: string, current: { start: string; end: string }): RefundOrigin[] {
  const currentStart = Date.parse(current.start);
  const seen = new Map<number, RefundOrigin>([
    [currentStart, { value: current.start, label: `This report’s period (${salesPeriodLabel(current.start, current.end)})`, end: current.end }],
  ]);
  for (const r of reports) {
    const start = Date.parse(r.periodStart);
    if (r.merchantBranchId !== branchId || r.status === "Voided" || start > currentStart || seen.has(start)) continue;
    seen.set(start, { value: r.periodStart, label: `${salesPeriodLabel(r.periodStart, r.periodEndExclusive)} · ${r.partnerReference}`, end: r.periodEndExclusive });
  }
  return [...seen.entries()].sort((a, b) => b[0] - a[0]).map(([, option]) => option);
}

/**
 * Whether a saved report holds exactly what a submission says. Used when an earlier
 * attempt's reply was lost: a report recorded with other values must never be taken
 * as this submission.
 */
export function salesReportMatches(report: api.SalesReport, input: api.SalesReportInput): boolean {
  const text = (value: string | null | undefined) => (value ?? "").trim();
  const line = (l: {
    productVariantId: string; lineType: string; priceTermId: string | null; unitNetPrice: number; quantity: number;
    refundOfPeriodStart?: string | null; restockableQuantity?: number; unsellableReturnedQuantity?: number; notes?: string | null;
    sealedReturnConfirmed?: boolean; sealedReturnEvidence?: string | null;
  }) => {
    const restock = l.restockableQuantity ?? 0;
    return [l.productVariantId, l.lineType, l.priceTermId ?? "", l.unitNetPrice.toFixed(2), l.quantity,
      l.refundOfPeriodStart ? Date.parse(l.refundOfPeriodStart) : "", restock, l.unsellableReturnedQuantity ?? 0, text(l.notes),
      restock > 0 && Boolean(l.sealedReturnConfirmed), restock > 0 ? text(l.sealedReturnEvidence) : ""].join("|");
  };
  const lines = (items: string[]) => [...items].sort().join("\n");
  const period = salesPeriodKeyOf(report.periodStart);
  return report.agreementId === input.agreementId && report.merchantBranchId === input.merchantBranchId
    && period.month === input.periodMonth && period.half === input.half
    && text(report.partnerReference).toUpperCase() === text(input.partnerReference).toUpperCase()
    && Date.parse(report.reportReceivedAt) === Date.parse(input.reportReceivedAt)
    && report.evidenceLevel === input.evidenceLevel && report.evidenceKind === input.evidenceKind
    && text(report.evidenceReference) === text(input.evidenceReference) && text(report.notes) === text(input.notes)
    && lines(report.lines.map(line)) === lines(input.lines.map((l) => line({ ...l, priceTermId: l.priceTermId })));
}

export function salesPeriodKeyOf(startIso: string): SalesPeriodKey {
  const p = malaysiaParts(startIso);
  return { month: `${p.year}-${String(p.month).padStart(2, "0")}`, half: p.day >= 16 ? 2 : 1 };
}

/** The period after the one ending at `endExclusiveIso`, or the current period. */
export function nextSalesPeriod(endExclusiveIso: string | null, now = new Date()): SalesPeriodKey {
  if (endExclusiveIso) return salesPeriodKeyOf(endExclusiveIso);
  const p = malaysiaParts(now.toISOString());
  const month = `${p.year}-${String(p.month).padStart(2, "0")}`;
  // The most recent period that has finished is the one usually being reported.
  if (p.day >= 16) return { month, half: 1 };
  const previous = new Date(Date.UTC(p.year, p.month - 2, 1));
  return { month: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`, half: 2 };
}

/** Recent months for a period picker, newest first. */
export function recentSalesMonths(count = 8, now = new Date()): { value: string; label: string }[] {
  const p = malaysiaParts(now.toISOString());
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(p.year, p.month - 1 - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { value, label: `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });
}

export function ringgit(value: number): string {
  return `RM${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function salesReportTone(status: string): AdminStatusTone {
  switch (status) {
    case "Verified":
      return "positive";
    case "Recorded":
      return "warning";
    case "Disputed":
      return "critical";
    case "Draft":
      return "info";
    default:
      return "neutral";
  }
}

export function salesReportStatusLabel(status: string): string {
  return status === "Recorded" ? "Recorded · unverified" : status;
}

export function salesReportNextStep(r: api.SalesReport): NextStep {
  switch (r.status) {
    case "Draft":
      return { label: "Finish and record", detail: "Draft, not yet recorded", tone: "info" };
    case "Recorded":
      return r.issues.length
        ? { label: "Dispute or correct", detail: `${r.issues.length} ${r.issues.length === 1 ? "issue blocks" : "issues block"} verification`, tone: "critical" }
        : { label: "Verify", detail: "Check against the partner’s evidence", tone: "warning" };
    case "Disputed":
      return r.supersededById
        ? { label: "Correction in progress", detail: "Continue with the newer version", tone: "info" }
        : { label: "Correct the report", detail: "Waiting for the partner’s corrected figures", tone: "critical" };
    case "Verified":
      return { label: "No action needed", detail: "Sold quantities moved out of shelf stock", tone: "positive" };
    case "Superseded":
      return { label: "Replaced", detail: "A newer version replaced this report", tone: "neutral" };
    default:
      return { label: "No action needed", detail: "Discarded draft", tone: "neutral" };
  }
}

// --- Monthly stocktake -----------------------------------------------------------

/**
 * Count dates a stocktake can close, newest first: the 15th and the last day of each month,
 * on or before today in Malaysia time. Each one ends a sales period.
 */
export function stocktakeCountDates(count = 6, now = new Date()): { value: string; label: string }[] {
  const today = malaysiaParts(now.toISOString());
  const options: { value: string; label: string }[] = [];
  for (let back = 0; options.length < count && back < 24; back += 1) {
    const d = new Date(Date.UTC(today.year, today.month - 1 - back, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const day of [last, 15]) {
      if (options.length >= count) break;
      const isFuture = year > today.year || (year === today.year && (month > today.month || (month === today.month && day > today.day)));
      if (isFuture) continue;
      options.push({
        value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        label: `${day} ${monthNames[month - 1]} ${year} · ${day === 15 ? "mid-month" : "month end"}`,
      });
    }
  }
  return options;
}

/** "31 Oct 2026" from a yyyy-MM-dd count date. */
export function countDateLabel(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${monthNames[m - 1]} ${y}`;
}

/** A Malaysia-time date and time (yyyy-MM-dd, HH:mm) as an ISO timestamp with its offset, or "" if incomplete. */
export function malaysiaTimestamp(date: string, time: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}:00+08:00` : "";
}

/** The Malaysia-time date (yyyy-MM-dd) and time (HH:mm) of an ISO timestamp. */
export function malaysiaDateTime(iso: string): { date: string; time: string } {
  const shifted = new Date(Date.parse(iso) + MALAYSIA_OFFSET_MINUTES * 60000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/** "1 Sep 2026, 9:05 am" in Malaysia time. */
export function malaysiaTimeLabel(iso: string): string {
  const { date, time } = malaysiaDateTime(iso);
  const [h, m] = time.split(":").map(Number);
  return `${countDateLabel(date)}, ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/**
 * The first problem with a reviewer's links from a late report to what a count found, or "".
 * The server checks the same rules again; this only keeps the dialog from sending a doomed request.
 */
export function lateLinkProblem(late: api.LateReport, drafts: Record<string, { quantity: string; evidence: string; explanation: string }>): string {
  for (const sku of late.skus) {
    let total = 0;
    for (const c of sku.candidates) {
      const d = drafts[c.discrepancyId];
      const quantity = d?.quantity.trim() ?? "";
      if (!quantity || quantity === "0") continue;
      if (!/^\d+$/.test(quantity)) return `${sku.sku}: enter a whole number to link, or 0.`;
      if (Number(quantity) > c.openQuantity) return `${sku.sku}: only ${c.openQuantity} of that finding is open.`;
      if (d.evidence.trim().length < 5) return `${sku.sku}: record the evidence that links this report to what the count found.`;
      if (d.explanation.trim().length < 10) return `${sku.sku}: explain why this report accounts for it (at least 10 characters).`;
      total += Number(quantity);
    }
    if (total > sku.capacity) return `${sku.sku}: this report can explain at most ${sku.capacity}.`;
    if (sku.requiredLinks && total < sku.requiredLinks)
      return `${sku.sku}: these sales are ${sku.requiredLinks} more than the shelf stock. Link at least ${sku.requiredLinks} to what the count found missing, with the evidence, or dispute the report.`;
  }
  return "";
}

/**
 * Whether a count taken on this Malaysia date was after its count date ended (midnight). Such a
 * count is accepted only up to a day later, with confirmation that nothing moved in between.
 */
export function countedAfterCutoff(countDate: string, countedOn: string): boolean {
  return Boolean(countDate && countedOn) && countedOn > countDate;
}

const discrepancyKindLabels: Record<string, string> = {
  Shortage: "Missing from the shelf",
  Surplus: "More than the books",
  UnsellableFound: "Damaged or opened",
  UnsellableShortage: "Unsellable stock missing",
};

export function discrepancyKindLabel(kind: string): string {
  return discrepancyKindLabels[kind] ?? kind;
}

const outcomeLabels: Record<string, { label: string; detail: string }> = {
  Found: { label: "Found at the shop", detail: "Goes back to the stock it was missing from." },
  FoundSellable: { label: "Found, sellable", detail: "Back on the shelf as sellable stock." },
  FoundDamaged: { label: "Found damaged", detail: "Moves to unsellable stock." },
  ApprovedLoss: { label: "Approved loss", detail: "Recorded as lost under the agreement's loss terms. The tags stay the partner's responsibility." },
  ConfirmedDamaged: { label: "Confirmed damaged", detail: "Stays as unsellable stock at the shop." },
  RecountSellable: { label: "Recount: actually sellable", detail: "Moves back to sellable stock." },
  ReturnedToMyPetLink: { label: "Marked as returned", detail: "No longer offered: damaged stock leaves the shop only through a dispatch return." },
  RecountError: { label: "Recount error", detail: "The extra packages weren't really there. No stock moves." },
  EarlierShortageFound: { label: "An earlier shortage found", detail: "Settles this surplus and that shortage together." },
  EarlierLossFound: { label: "An earlier approved loss found", detail: "Moves the units from lost back to sellable stock." },
  NoLongerPresent: { label: "Not found at the next count", detail: "Closed by the stocktake." },
  ExplainedByLateReport: { label: "Explained by a late sales report", detail: "Linked by the reviewer when the report was verified." },
  AllocationWithdrawn: { label: "Explanation withdrawn", detail: "A corrected report replaced the one that explained this, so it is open again." },
  FoundThroughSurplus: { label: "Found through a later surplus", detail: "Settled together with that surplus." },
};

export function outcomeLabel(outcome: string): string {
  return outcomeLabels[outcome]?.label ?? outcome;
}

export function outcomeDetail(outcome: string): string {
  return outcomeLabels[outcome]?.detail ?? "";
}

export function stocktakeTone(status: string): AdminStatusTone {
  switch (status) {
    case "Approved":
      return "positive";
    case "Recorded":
      return "warning";
    case "Draft":
      return "info";
    default:
      return "neutral";
  }
}

export function stocktakeStatusLabel(status: string): string {
  return status === "Approved" ? "Closed" : status === "Recorded" ? "Recorded · not closed" : status === "Voided" ? "Discarded" : status;
}

/** What the count found for one SKU, in a few words. */
export function stocktakeFinding(line: api.StocktakeLine): string {
  const parts: string[] = [];
  if (line.shortage) parts.push(`${line.shortage} missing`);
  if (line.unsellableFound) parts.push(`${line.unsellableFound} damaged`);
  if (line.unsellableShortage) parts.push(`${line.unsellableShortage} unsellable missing`);
  if (line.surplus) parts.push(`${line.surplus} extra`);
  if (line.surplusNoLongerPresent) parts.push(`${line.surplusNoLongerPresent} earlier extra not found`);
  return parts.length ? parts.join(" · ") : "Matches";
}

/** Whether a saved stocktake holds exactly what was submitted, for a retry whose reply was lost. */
export function stocktakeMatches(saved: api.Stocktake, input: api.StocktakeInput): boolean {
  const text = (value: string | null | undefined) => (value ?? "").trim();
  const counts = (lines: { productVariantId: string; countedSellable: number | null; countedUnsellable: number | null }[]) =>
    lines.map((l) => `${l.productVariantId}|${l.countedSellable}|${l.countedUnsellable}`).sort().join("\n");
  const instant = (value: string | null | undefined) => (value ? Date.parse(value) : NaN);
  return saved.merchantBranchId === input.merchantBranchId && saved.countDate === input.countDate
    && instant(saved.countedAt) === instant(input.countedAt) && text(saved.countedAfterCutoffNote) === text(input.countedAfterCutoffNote)
    && text(saved.countedBy) === text(input.countedBy) && saved.evidenceKind === input.evidenceKind
    && text(saved.evidenceReference) === text(input.evidenceReference) && text(saved.notes) === text(input.notes)
    && counts(saved.lines.filter((l) => l.countedSellable !== null)) === counts(input.lines);
}

/**
 * What closing the month will record for one SKU, mirroring the server's rule: damaged packages
 * come off the shelf first, a shortage first uses up earlier surplus notes, and extra stock is only noted.
 */
export function previewCount(line: api.StocktakeLine, countedSellable: number, countedUnsellable: number) {
  const newlyUnsellable = Math.max(0, countedUnsellable - line.bookUnsellable);
  const damaged = Math.min(newlyUnsellable, Math.max(0, line.bookSellable));
  const unsellableMissing = Math.max(0, line.bookUnsellable - countedUnsellable);
  const diff = countedSellable - (line.bookSellable - damaged + line.openSurplusBefore);
  const earlierExtraGone = diff < 0 ? Math.min(line.openSurplusBefore, -diff) : 0;
  const missing = diff < 0 ? -diff - earlierExtraGone : 0;
  const extra = Math.max(0, diff) + (newlyUnsellable - damaged);
  const parts: string[] = [];
  if (missing) parts.push(`${missing} missing`);
  if (damaged) parts.push(`${damaged} damaged`);
  if (unsellableMissing) parts.push(`${unsellableMissing} unsellable missing`);
  if (extra) parts.push(`${extra} extra`);
  if (earlierExtraGone) parts.push(`${earlierExtraGone} earlier extra not found`);
  return parts.length ? parts.join(" · ") : "Matches";
}
