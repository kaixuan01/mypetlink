import { apiRequest, apiRequestBlob } from "@/services/apiClient";

const base = "/api/v1/admin/merchant-sales/consignment";
export type AgreementInput = {
  merchantId: string; reference: string; partnerCommissionPercentage: number | null;
  effectiveFrom: string | null; effectiveTo: string | null; durationTerms: string | null;
  settlementFrequency: string | null; paymentDeadlineDays: number | null;
  discountTerms: string | null; returnTerms: string | null; lossTerms: string | null;
  signedAgreementReference: string | null; externalTrackerReference: string | null;
  supersedesAgreementId?: string | null;
};
export type Agreement = AgreementInput & {
  id: string; merchantName: string; version: number; status: string;
  partnerCommissionPercentage: number;
  pendingTerms: string[]; concurrencyToken: string; approvalReviewMode?: string | null;
  /** The default-terms revision the creating form started from; audit only. */
  defaultTermsRevision?: number | null;
};
export type CustodyUnit = {
  id: string; unitReference: string; receivingState: string; tagCode: string | null; sku: string; productName: string; variant: string;
  batch: string | null; status: string; qaStatus: string; isActivated: boolean; externalReference: string | null; currentHandoverRecordId: string | null;
  /** Whether this unit counts in the partner's SKU stock. One delivery can mix units received before and after tracking began. */
  stockTracked?: boolean;
};
export type ConsignmentDispatch = {
  id: string; agreementId: string; dispatchNumber: string; merchantName: string;
  agreementReference: string; agreementVersion: number; commissionPercentage: number;
  destination: string; status: string; externalTrackerReference: string;
  dispatchedAt: string | null; receivedAt: string | null; shipmentReference: string | null;
  receiptAcknowledgment: string | null; reserved: number; partnerHeld: number;
  returnedQuarantine: number; released: number; externalHandovers: number; writtenOff: number;
  activatedWithoutExternalReference: number; units: CustodyUnit[];
  history: { action: string; reference: string; occurredAt: string; unitId: string | null; actorAdminUserId: string; actorName: string | null; evidenceJson: string | null; reviewMode?: string | null }[]; concurrencyToken: string;
  merchantBranchId: string | null; hasOpenDiscrepancy: boolean; hasIssuedDocument: boolean;
  recipientName: string | null; partnerReceivedAt: string | null; receivedQuantity: number | null;
  reconciliation: HandoverRecord[]; reservationReused?: boolean; reviews?: ReviewEvent[];
  /** Whether any received unit counts in the partner's SKU stock. Handover forms decide per unit instead. */
  stockTracked?: boolean;
};
export type ReserveInput = { agreementId: string; destination: string; externalTrackerReference: string;
  merchantBranchId: string; idempotencyKey: string; lines: { productVariantId: string; quantity: number; smartTagIds?: string[] }[] };
export type ReceiptEvidence = { recipient: string; receivedAt: string; quantity: number; damagedQuantity: number; missingQuantity: number; signedEvidenceReference: string; goodUnitIds?: string[]; damagedUnitIds?: string[]; missingUnitIds?: string[]; returnedUnitIds?: string[] };
export type HandoverEvidence = { eventReference: string; eventAt: string; isReportedSale: boolean; sellingPrice: number | null; discountAmount: number | null; discountDescription: string | null; supersedesRecordId?: string | null;
  attribution?: HandoverAttribution | null };
export type HandoverAttribution = "AggregateSale" | "NonSaleWithdrawal";
export type HandoverRecord = HandoverEvidence & { id: string; unitId: string; actorAdminUserId: string; kind: string; recordedAt: string; evidenceReference: string; verificationStatus: string };
export type CustodyAction = "dispatch" | "receive" | "cancel" | "return" | "release" | "external-handover" | "correct-handover" | "reverse-handover" | "write-off" | "record-discrepancy" | "resolve-discrepancy";
export type SelfReview = {confirmed:boolean;reason:string;externalEvidenceReference:string};
export type ReviewEvent = {id:string;action:string;reviewMode:string;actorAdminUserId:string;recordedAt:string;reason:string;externalEvidenceReference:string;policyMode:string;previousPolicyMode:string|null;selfReviewerAdminUserId:string|null;previousSelfReviewerAdminUserId:string|null;agreementId:string|null;dispatchId:string|null;subjectType?:string|null;subjectId?:string|null};
export type ApprovalPolicy = {selfReviewerIsEligible?:boolean;mode:"Team"|"Solo";selfReviewerAdminUserId:string|null;selfReviewerName:string|null;canSelfReview:boolean;updatedByAdminUserId:string|null;updatedAt:string|null;concurrencyToken:string;eligibleReviewers:{adminUserId:string;name:string;hasSelfReviewCapability:boolean}[];history:ReviewEvent[]};
export type ApprovalPolicyInput = {concurrencyToken:string;mode:"Team"|"Solo";selfReviewerAdminUserId:string|null;confirmed:boolean;reason:string};
export async function getApprovalPolicy(){return requireData((await apiRequest<ApprovalPolicy>(`${base}/approval-policy`)).data);}
export async function saveApprovalPolicy(input:ApprovalPolicyInput){return requireData((await apiRequest<ApprovalPolicy>(`${base}/approval-policy`,{method:"PUT",body:input})).data);}
export async function downloadReviewLog(from:string,to:string){const r=await apiRequestBlob(`${base}/review-log.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);saveBlob(r.blob,"MyPetLink-consignment-review-log.csv");}
export type ActionEvidence = { receipt?: ReceiptEvidence; handover?: HandoverEvidence; selfReview?: SelfReview;
  returnFromBucket?: "Sellable" | "Unsellable" };
function requireData<T>(data: T | undefined | null): T {
  if (!data) throw new Error("We couldn't load this record. Please try again.");
  return data;
}
/** The list endpoints take a page size (1–100) and one optional filter each. */
export type ListOptions = { pageSize?: number; merchantId?: string; agreementId?: string };
function listQuery(page: number, options: ListOptions, filter: "merchantId" | "agreementId") {
  const params = new URLSearchParams({ page: String(page), pageSize: String(options.pageSize ?? 20) });
  const value = options[filter];
  if (value) params.set(filter, value);
  return params.toString();
}
export async function listAgreements(page = 1, options: ListOptions = {}) {
  const r = await apiRequest<Agreement[]>(`${base}/agreements?${listQuery(page, options, "merchantId")}`);
  return { items: r.data ?? [], total: r.meta?.total ?? 0 };
}
/**
 * A new agreement's reference is assigned by the server, so none is sent. idempotencyKey makes a
 * retried "create draft" return the draft it already created instead of taking another number.
 */
export async function saveAgreement(input: AgreementInput, id?: string, token?: string,
  creation: { idempotencyKey?: string; defaultTermsRevision?: number | null } = {}) {
  const path = id ? `/${id}?concurrencyToken=${encodeURIComponent(token ?? "")}` : "";
  const body = { ...input, reference: input.reference.trim() || null, ...(id ? {} : creation) };
  return requireData((await apiRequest<Agreement>(`${base}/agreements${path}`, { method: id ? "PUT" : "POST", body })).data);
}
// --- Automatic references and default terms -------------------------------------------
export type AgreementPrefix = {
  merchantId: string; prefix: string | null; suggestedPrefix: string; locked: boolean; lockedAt: string | null;
  /** e.g. "ANKPETS-CONS-2026-": the number is only assigned when the draft is saved. */
  referencePattern: string; concurrencyToken: string;
};
export async function getAgreementPrefix(merchantId: string) {
  return requireData((await apiRequest<AgreementPrefix>(`${base}/merchants/${merchantId}/agreement-prefix`)).data);
}
export async function saveAgreementPrefix(merchantId: string, prefix: string, concurrencyToken: string) {
  return requireData((await apiRequest<AgreementPrefix>(`${base}/merchants/${merchantId}/agreement-prefix`, {
    method: "PUT", body: { prefix, concurrencyToken },
  })).data);
}
export type DefaultTermsValues = {
  partnerCommissionPercentage: number | null; trialDurationDays: number | null; durationTerms: string | null;
  settlementFrequency: string | null; paymentDeadlineDays: number | null; discountTerms: string | null;
  returnTerms: string | null; lossTerms: string | null;
};
export type DefaultTerms = {
  revision: number; isActive: boolean; terms: DefaultTermsValues; missing: string[]; updatedAt: string | null;
  updatedByName: string | null; concurrencyToken: string;
  history: { revision: number; isActive: boolean; terms: DefaultTermsValues; recordedAt: string; recordedByName: string | null }[];
};
export async function getDefaultTerms() {
  return requireData((await apiRequest<DefaultTerms>(`${base}/default-terms`)).data);
}
export async function saveDefaultTerms(terms: DefaultTermsValues, isActive: boolean, concurrencyToken: string) {
  return requireData((await apiRequest<DefaultTerms>(`${base}/default-terms`, { method: "PUT", body: { terms, isActive, concurrencyToken } })).data);
}
export async function agreementAction(a: Agreement, action: "approve" | "close", reference: string, selfReview?: SelfReview) {
  return requireData((await apiRequest<Agreement>(`${base}/agreements/${a.id}/${action}`, {
    method: "POST", body: { concurrencyToken: a.concurrencyToken, reference, ...(selfReview?{selfReview}:{}) },
  })).data);
}
export async function listDispatches(page = 1, options: ListOptions = {}) {
  const r = await apiRequest<ConsignmentDispatch[]>(`${base}/dispatches?${listQuery(page, options, "agreementId")}`);
  return { items: r.data ?? [], total: r.meta?.total ?? 0 };
}
export async function getDispatch(id: string, manifest = false) {
  return requireData((await apiRequest<ConsignmentDispatch>(`${base}/dispatches/${id}${manifest ? "/manifest" : ""}`)).data);
}
export async function reserveConsignment(input: ReserveInput) {
  return requireData((await apiRequest<ConsignmentDispatch>(`${base}/dispatches`, { method: "POST", body: input })).data);
}
export async function custodyAction(d: ConsignmentDispatch, action: CustodyAction, reference: string, unitIds: string[], evidence: ActionEvidence = {}) {
  return requireData((await apiRequest<ConsignmentDispatch>(`${base}/dispatches/${d.id}/${action}`, {
    method: "POST", body: { concurrencyToken: d.concurrencyToken, reference, unitIds, ...evidence },
  })).data);
}
export async function downloadConsignment(id: string, kind: "dispatch-note.pdf" | "manifest.csv") {
  const response = await apiRequestBlob(`${base}/dispatches/${id}/${kind}`);
  const expected = kind.endsWith("pdf") ? "application/pdf" : "text/csv";
  if (!response.blob.type.startsWith(expected)) throw new Error("The document could not be prepared.");
  saveBlob(response.blob,response.fileName ?? `MyPetLink-Consignment-${id}-${kind}`);
}
export async function downloadReconciliation(from: string,to: string) {
  const response = await apiRequestBlob(`${base}/reconciliation.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  saveBlob(response.blob,"MyPetLink-consignment-reconciliation.csv");
}
// --- Approved selling prices ---------------------------------------------------
export type PriceTermKind = "Standard" | "Promotion";
export type PriceTerm = {
  id: string; agreementId: string; productVariantId: string; sku: string; kind: PriceTermKind; name: string;
  unitNetPrice: number; validFrom: string; validToExclusive: string | null; approvalEvidenceReference: string | null;
  status: "Draft" | "Approved" | "Withdrawn"; approvedAt: string | null; reviewMode: string | null; concurrencyToken: string;
  /** False when earlier edits to this price weren't recorded; nobody can approve it as independent. */
  contributorHistoryComplete?: boolean;
};
export type PriceTermInput = {
  agreementId: string; productVariantId: string; kind: PriceTermKind; name: string | null; unitNetPrice: number;
  validFrom: string; validToExclusive: string | null; approvalEvidenceReference: string | null;
};
/**
 * allocations: when verifying a report for a month a stocktake has already closed, the reviewer's
 * links to what that count found. reviewedFingerprint: when closing a month, the findings reviewed.
 */
export type ReviewInput = {
  reason?: string | null; selfReview?: SelfReview; acknowledgeWarnings?: boolean; endAt?: string | null;
  allocations?: LateAllocationInput[]; reviewedFingerprint?: string | null;
};
export async function listPriceTerms(agreementId: string) {
  return (await apiRequest<PriceTerm[]>(`${base}/price-terms?agreementId=${encodeURIComponent(agreementId)}`)).data ?? [];
}
export async function savePriceTerm(input: PriceTermInput, existing?: PriceTerm) {
  const path = existing ? `/${existing.id}?concurrencyToken=${encodeURIComponent(existing.concurrencyToken)}` : "";
  return requireData((await apiRequest<PriceTerm>(`${base}/price-terms${path}`, { method: existing ? "PUT" : "POST", body: input })).data);
}
export async function priceTermAction(term: PriceTerm, action: "approve" | "end" | "withdraw", input: ReviewInput = {}) {
  return requireData((await apiRequest<PriceTerm>(`${base}/price-terms/${term.id}/${action}`, {
    method: "POST", body: { concurrencyToken: term.concurrencyToken, ...input } })).data);
}
export async function copyPriceTerms(fromAgreementId: string, toAgreementId: string) {
  return (await apiRequest<PriceTerm[]>(`${base}/price-terms/copy`, { method: "POST", body: { fromAgreementId, toAgreementId } })).data ?? [];
}

// --- Partner sales reports -------------------------------------------------------
export type SalesReportStatus = "Draft" | "Recorded" | "Verified" | "Disputed" | "Superseded" | "Voided";
export type EvidenceLevel = "Documented" | "Summary";
export type EvidenceKind = "WhatsApp summary" | "POS report" | "Sales record photo" | "Other";
export type SalesLineInput = {
  productVariantId: string; lineType: "Sale" | "Refund"; priceTermId: string | null; unitNetPrice: number; quantity: number;
  refundOfPeriodStart?: string | null; restockableQuantity?: number; unsellableReturnedQuantity?: number; notes?: string | null;
  /** Required with any restocked quantity: someone checked the packages came back sealed, and how. */
  sealedReturnConfirmed?: boolean; sealedReturnEvidence?: string | null;
};
export type SalesReportInput = {
  agreementId: string; merchantBranchId: string; periodMonth: string; half: 1 | 2; partnerReference: string;
  reportReceivedAt: string; evidenceLevel: EvidenceLevel; evidenceKind: EvidenceKind; evidenceReference: string | null;
  notes: string | null; lines: SalesLineInput[]; idempotencyKey?: string;
};
export type SalesLine = {
  id: string; productVariantId: string; sku: string; productName: string; lineType: "Sale" | "Refund"; priceTermId: string | null;
  priceTermName: string | null; priceTermKind: PriceTermKind | null; unitListPrice: number | null; unitNetPrice: number; quantity: number;
  netValue: number; promotionalDiscount: number; refundOfPeriodStart: string | null; restockableQuantity: number;
  unsellableReturnedQuantity: number; notes: string | null; sealedReturnConfirmed: boolean; sealedReturnEvidence: string | null;
};
export type SalesReport = {
  id: string; merchantId: string; merchantName: string; merchantBranchId: string; branchName: string; agreementId: string;
  agreementReference: string; agreementVersion: number; periodStart: string; periodEndExclusive: string; partnerReference: string;
  version: number; supersedesReportId: string | null; supersededById: string | null; reportReceivedAt: string;
  evidenceLevel: EvidenceLevel; evidenceKind: EvidenceKind; evidenceReference: string; notes: string | null; status: SalesReportStatus;
  createdAt: string; recordedAt: string | null; verifiedAt: string | null; reviewMode: string | null; disputedAt: string | null;
  disputeReason: string | null; lines: SalesLine[]; unitsSold: number; unitsRefunded: number; netSalesValue: number;
  issues: string[]; warnings: string[]; concurrencyToken: string;
  /** False when someone may have edited these figures without it being recorded. */
  contributorHistoryComplete?: boolean;
  /** Set while the report is unverified and a stocktake has already closed its month. */
  lateReport?: LateReport | null;
  /** Issues the reviewer's links to what the closing count found can resolve; every other issue blocks verification. */
  linkResolvableIssues?: string[];
};
/** A discrepancy a late report could explain: found by the first count after its period. */
export type LateCandidate = {
  discrepancyId: string; kind: "Shortage" | "Surplus"; originStocktakeId: string; originCountDate: string; originCutoffAt: string;
  quantity: number; openQuantity: number;
};
/** An explanation by the version a correction replaces; verifying withdraws it. */
export type LateWithdrawal = { resolutionId: string; discrepancyId: string; kind: string; salesReportId: string; quantity: number };
export type LateSku = {
  productVariantId: string; sku: string; lateShelfChange: number; explainsKind: "Shortage" | "Surplus" | null; capacity: number;
  candidates: LateCandidate[]; withdrawn: LateWithdrawal[];
  /** Units that must be linked to this SKU's shortage before the report can verify (0 if none). */
  requiredLinks?: number;
};
export type LateReport = { closedByStocktakeId: string; closedCountDate: string; closedCutoffAt: string; skus: LateSku[] };
export type LateAllocationInput = { discrepancyId: string; quantity: number; evidenceReference: string; explanation: string };
export type SalesReportFilters = { merchantId?: string; branchId?: string; status?: SalesReportStatus | "" };
export async function listSalesReports(page = 1, filters: SalesReportFilters = {}, pageSize = 20) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const r = await apiRequest<SalesReport[]>(`${base}/sales-reports?${params.toString()}`);
  return { items: r.data ?? [], total: r.meta?.total ?? 0 };
}
export async function getSalesReport(id: string) {
  return requireData((await apiRequest<SalesReport>(`${base}/sales-reports/${id}`)).data);
}
export async function saveSalesReport(input: SalesReportInput, existing?: SalesReport) {
  const path = existing ? `/${existing.id}?concurrencyToken=${encodeURIComponent(existing.concurrencyToken)}` : "";
  return requireData((await apiRequest<SalesReport>(`${base}/sales-reports${path}`, { method: existing ? "PUT" : "POST", body: input })).data);
}
export async function salesReportAction(report: SalesReport, action: "record" | "void" | "correct" | "re-enter" | "verify" | "dispute",
  input: ReviewInput = {}) {
  return requireData((await apiRequest<SalesReport>(`${base}/sales-reports/${report.id}/${action}`, {
    method: "POST", body: { concurrencyToken: report.concurrencyToken, ...input } })).data);
}

// --- SKU stock position ------------------------------------------------------------
export type SkuPosition = {
  productVariantId: string; sku: string; productName: string; sellable: number; unsellable: number; investigation: number;
  soldUnidentified: number; lostUnidentified: number; unverifiedSold: number; unverifiedRestockable: number;
  provisionalSellable: number; custodyUnits: number; tieOutBalanced: boolean; untrackedUnits: number; deliveryHolds: number;
  activatedInCustody: number;
  /** Counted packages beyond the books, noted for investigation; never added to stock. */
  openSurplus?: number; openDiscrepancies?: number;
};
export type StockPosition = {
  merchantId: string; merchantName: string; merchantBranchId: string; branchName: string; skus: SkuPosition[];
  lastVerifiedPeriodEnd: string | null; reportsAwaitingVerification: number; disputedReports: number;
  /** The last day of the latest month a stocktake closed (yyyy-MM-dd). */
  lastClosedCountDate?: string | null; openDiscrepancies?: number; stocktakeInProgress?: boolean;
};
export async function listStockPositions(merchantId?: string) {
  return (await apiRequest<StockPosition[]>(`${base}/stock-positions${merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : ""}`)).data ?? [];
}
export async function startStockTracking(merchantBranchId: string, reason: string) {
  return requireData((await apiRequest<StockPosition>(`${base}/stock-tracking/start`, { method: "POST", body: { merchantBranchId, reason } })).data);
}
export async function downloadSalesReports(from: string, to: string) {
  const r = await apiRequestBlob(`${base}/sales-reports.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  saveBlob(r.blob, "MyPetLink-consignment-sales-reports.csv");
}
export async function downloadStockLedger(from: string, to: string) {
  const r = await apiRequestBlob(`${base}/stock-ledger.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  saveBlob(r.blob, "MyPetLink-consignment-stock-ledger.csv");
}

// --- Monthly stocktake, period close and discrepancies ----------------------------
export type StocktakeStatus = "Draft" | "Recorded" | "Approved" | "Voided";
export type CountEvidenceKind = "Count sheet photo" | "WhatsApp count summary" | "Joint count in person" | "Other";
export type StocktakeLine = {
  id: string | null; productVariantId: string; sku: string; productName: string;
  bookSellable: number; bookUnsellable: number; bookInvestigation: number; bookSold: number; bookLost: number; openSurplusBefore: number;
  expectedSellable: number; expectedUnsellable: number; countedSellable: number | null; countedUnsellable: number | null;
  sellableVariance: number | null; unsellableVariance: number | null; unsellableFound: number; unsellableShortage: number;
  shortage: number; surplus: number; surplusNoLongerPresent: number; closingSellable: number; closingUnsellable: number;
  closingInvestigation: number; closingSold: number; closingLost: number; openSurplusAfter: number; custodyUnits: number;
  notes: string | null; frozen: boolean;
};
export type Stocktake = {
  id: string; merchantId: string; merchantName: string; merchantBranchId: string; branchName: string; countDate: string; cutoffAt: string;
  countedBy: string; evidenceKind: CountEvidenceKind; evidenceReference: string; notes: string | null; status: StocktakeStatus;
  previousStocktakeId: string | null; previousCutoffAt: string | null; createdAt: string; recordedAt: string | null; approvedAt: string | null;
  reviewMode: string | null; lines: StocktakeLine[]; issues: string[]; warnings: string[]; concurrencyToken: string;
  /** When the shelf was physically counted (ISO); null only for counts entered before this was recorded. */
  countedAt?: string | null; countedAfterCutoffNote?: string | null;
  /** Identifies the findings shown; closing with acknowledged findings sends it back. */
  reviewFingerprint?: string | null;
};
export type StocktakeExpectation = {
  merchantBranchId: string; countDate: string; cutoffAt: string; previousCutoffAt: string | null; lines: StocktakeLine[]; issues: string[];
};
export type StocktakeInput = {
  merchantBranchId: string; countDate: string; countedBy: string; evidenceKind: CountEvidenceKind; evidenceReference: string | null;
  notes: string | null; lines: { productVariantId: string; countedSellable: number; countedUnsellable: number; notes?: string | null }[];
  idempotencyKey?: string;
  /** When the shelf was physically counted, with its Malaysia offset (for example 2026-08-31T21:00:00+08:00). */
  countedAt: string; countedAfterCutoffNote?: string | null;
};
export type DiscrepancyKind = "Shortage" | "Surplus" | "UnsellableFound" | "UnsellableShortage";
export type DiscrepancyResolution = {
  id: string; outcome: string; quantity: number; evidenceReference: string; reason: string; linkedSalesReportId: string | null;
  relatedDiscrepancyId: string | null; reviewMode: string | null; actorAdminUserId: string; recordedAt: string;
  /** Set on a withdrawal: the explanation it reverses. */
  reversesResolutionId?: string | null;
};
export type Discrepancy = {
  id: string; merchantId: string; merchantName: string; merchantBranchId: string; branchName: string; productVariantId: string; sku: string;
  originStocktakeId: string; originCountDate: string; kind: DiscrepancyKind; quantity: number; openQuantity: number;
  status: "Open" | "Resolved"; allowedOutcomes: string[]; resolutions: DiscrepancyResolution[]; createdAt: string; concurrencyToken: string;
  originCutoffAt?: string;
};
export type ResolveDiscrepancyInput = {
  outcome: string; quantity: number; evidenceReference: string; reason: string; relatedDiscrepancyId?: string | null; selfReview?: SelfReview;
};
export async function getStocktakeExpectation(branchId: string, countDate: string) {
  return requireData((await apiRequest<StocktakeExpectation>(
    `${base}/stocktakes/expected?branchId=${encodeURIComponent(branchId)}&countDate=${encodeURIComponent(countDate)}`)).data);
}
export async function listStocktakes(page = 1, filters: { branchId?: string; status?: StocktakeStatus | "" } = {}, pageSize = 20) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const r = await apiRequest<Stocktake[]>(`${base}/stocktakes?${params.toString()}`);
  return { items: r.data ?? [], total: r.meta?.total ?? 0 };
}
export async function getStocktake(id: string) {
  return requireData((await apiRequest<Stocktake>(`${base}/stocktakes/${id}`)).data);
}
export async function saveStocktake(input: StocktakeInput, existing?: Stocktake) {
  const path = existing ? `/${existing.id}?concurrencyToken=${encodeURIComponent(existing.concurrencyToken)}` : "";
  return requireData((await apiRequest<Stocktake>(`${base}/stocktakes${path}`, { method: existing ? "PUT" : "POST", body: input })).data);
}
export async function stocktakeAction(stocktake: Stocktake, action: "record" | "void" | "approve", input: ReviewInput = {}) {
  return requireData((await apiRequest<Stocktake>(`${base}/stocktakes/${stocktake.id}/${action}`, {
    method: "POST", body: { concurrencyToken: stocktake.concurrencyToken, ...input } })).data);
}
export async function listDiscrepancies(filters: { branchId?: string; status?: "Open" | "Resolved" | "" } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return (await apiRequest<Discrepancy[]>(`${base}/discrepancies${params.size ? `?${params.toString()}` : ""}`)).data ?? [];
}
export async function resolveDiscrepancy(discrepancy: Discrepancy, input: ResolveDiscrepancyInput) {
  return requireData((await apiRequest<Discrepancy>(`${base}/discrepancies/${discrepancy.id}/resolve`, {
    method: "POST", body: { concurrencyToken: discrepancy.concurrencyToken, ...input } })).data);
}
export async function downloadStocktakes(from: string, to: string) {
  const r = await apiRequestBlob(`${base}/stocktakes.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  saveBlob(r.blob, "MyPetLink-consignment-stocktakes.csv");
}

// --- Agreement document ---------------------------------------------------------
/** Derived by the server from the saved agreement, its issued copies and signed copies. Never an approval. */
export type AgreementDocumentStatus = "incomplete" | "ready" | "issued" | "signed-copy-received" | "approved" | "closed";
export type IssuedAgreementDocument = {
  id: string; issueNumber: number; agreementVersion: number; termsFingerprint: string; contentSha256: string;
  fileName: string; issuedAt: string; issuedByName: string | null; isCurrent: boolean;
};
export type SignedAgreementCopy = {
  id: string; issuedDocumentId: string; issueNumber: number; agreementVersion: number; originalFileName: string; contentType: string;
  fileSize: number; sha256: string; partnerSignatoryName: string; partnerSignatoryDesignation: string | null; partnerSignedOn: string;
  companySignatoryName: string | null; companySignatoryDesignation: string | null; companySignedOn: string | null; notes: string | null;
  uploadedAt: string; uploadedByName: string | null; matchesCurrentTerms: boolean;
};
export type AgreementDocumentSummary = {
  agreementId: string; reference: string; version: number; status: AgreementDocumentStatus; statusLabel: string;
  missingForDocument: string[]; currentTermsFingerprint: string | null; currentIssuedDocumentId: string | null;
  issuedPartyDetailsChanged: boolean; signedCopyMatchesCurrentTerms: boolean; canIssue: boolean; concurrencyToken: string;
  issuedDocuments: IssuedAgreementDocument[]; signedCopies: SignedAgreementCopy[];
};
export type SignedCopyInput = {
  issuedDocumentId: string; fileName: string; contentType: string; contentBase64: string;
  partnerSignatoryName: string; partnerSignatoryDesignation: string | null; partnerSignedOn: string;
  companySignatoryName: string | null; companySignatoryDesignation: string | null; companySignedOn: string | null; notes: string | null;
};
export type AgreementFile = { blob: Blob; fileName: string };
export const MAX_SIGNED_COPY_BYTES = 8 * 1024 * 1024;
export async function getAgreementDocument(agreementId: string) {
  return requireData((await apiRequest<AgreementDocumentSummary>(`${base}/agreements/${agreementId}/document`)).data);
}
async function pdfFile(path: string, fallbackName: string): Promise<AgreementFile> {
  const response = await apiRequestBlob(path);
  if (!response.blob.type.startsWith("application/pdf")) throw new Error("The agreement could not be prepared. Please try again.");
  return { blob: response.blob, fileName: response.fileName ?? fallbackName };
}
/** The saved terms the operator is looking at. A later save by anyone else is refused, never previewed silently. */
export async function previewAgreementDocument(a: Agreement) {
  return pdfFile(`${base}/agreements/${a.id}/document/preview.pdf?concurrencyToken=${encodeURIComponent(a.concurrencyToken)}`,
    `MyPetLink_Consignment_${a.reference}_v${a.version}_PREVIEW.pdf`);
}
export async function issueAgreementDocument(a: Agreement) {
  return requireData((await apiRequest<AgreementDocumentSummary>(`${base}/agreements/${a.id}/document/issue`, {
    method: "POST", body: { concurrencyToken: a.concurrencyToken },
  })).data);
}
export async function fetchIssuedAgreement(agreementId: string, document: IssuedAgreementDocument) {
  return pdfFile(`${base}/agreements/${agreementId}/documents/${document.id}/pdf`, document.fileName);
}
export async function uploadSignedAgreement(agreementId: string, input: SignedCopyInput) {
  return requireData((await apiRequest<AgreementDocumentSummary>(`${base}/agreements/${agreementId}/signed-copies`, { method: "POST", body: input })).data);
}
export async function fetchSignedAgreement(agreementId: string, copy: SignedAgreementCopy): Promise<AgreementFile> {
  const response = await apiRequestBlob(`${base}/agreements/${agreementId}/signed-copies/${copy.id}/file`);
  return { blob: response.blob, fileName: response.fileName ?? copy.originalFileName };
}
export function saveAgreementFile(file: AgreementFile) {
  saveBlob(file.blob, file.fileName);
}
function saveBlob(blob: Blob,fileName: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a"); link.href = url;
    link.download = fileName; document.body.append(link); link.click(); link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url),0); }
}
