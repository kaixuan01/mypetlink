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
};
export type CustodyUnit = {
  id: string; unitReference: string; receivingState: string; tagCode: string | null; sku: string; productName: string; variant: string;
  batch: string | null; status: string; qaStatus: string; isActivated: boolean; externalReference: string | null; currentHandoverRecordId: string | null;
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
};
export type ReserveInput = { agreementId: string; destination: string; externalTrackerReference: string;
  merchantBranchId: string; idempotencyKey: string; lines: { productVariantId: string; quantity: number; smartTagIds?: string[] }[] };
export type ReceiptEvidence = { recipient: string; receivedAt: string; quantity: number; damagedQuantity: number; missingQuantity: number; signedEvidenceReference: string; goodUnitIds?: string[]; damagedUnitIds?: string[]; missingUnitIds?: string[]; returnedUnitIds?: string[] };
export type HandoverEvidence = { eventReference: string; eventAt: string; isReportedSale: boolean; sellingPrice: number | null; discountAmount: number | null; discountDescription: string | null; supersedesRecordId?: string | null };
export type HandoverRecord = HandoverEvidence & { id: string; unitId: string; actorAdminUserId: string; kind: string; recordedAt: string; evidenceReference: string; verificationStatus: string };
export type CustodyAction = "dispatch" | "receive" | "cancel" | "return" | "release" | "external-handover" | "correct-handover" | "reverse-handover" | "write-off" | "record-discrepancy" | "resolve-discrepancy";
export type SelfReview = {confirmed:boolean;reason:string;externalEvidenceReference:string};
export type ReviewEvent = {id:string;action:string;reviewMode:string;actorAdminUserId:string;recordedAt:string;reason:string;externalEvidenceReference:string;policyMode:string;previousPolicyMode:string|null;selfReviewerAdminUserId:string|null;previousSelfReviewerAdminUserId:string|null;agreementId:string|null;dispatchId:string|null};
export type ApprovalPolicy = {selfReviewerIsEligible?:boolean;mode:"Team"|"Solo";selfReviewerAdminUserId:string|null;selfReviewerName:string|null;canSelfReview:boolean;updatedByAdminUserId:string|null;updatedAt:string|null;concurrencyToken:string;eligibleReviewers:{adminUserId:string;name:string;hasSelfReviewCapability:boolean}[];history:ReviewEvent[]};
export type ApprovalPolicyInput = {concurrencyToken:string;mode:"Team"|"Solo";selfReviewerAdminUserId:string|null;confirmed:boolean;reason:string};
export async function getApprovalPolicy(){return requireData((await apiRequest<ApprovalPolicy>(`${base}/approval-policy`)).data);}
export async function saveApprovalPolicy(input:ApprovalPolicyInput){return requireData((await apiRequest<ApprovalPolicy>(`${base}/approval-policy`,{method:"PUT",body:input})).data);}
export async function downloadReviewLog(from:string,to:string){const r=await apiRequestBlob(`${base}/review-log.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);saveBlob(r.blob,"MyPetLink-consignment-review-log.csv");}
export type ActionEvidence = { receipt?: ReceiptEvidence; handover?: HandoverEvidence; selfReview?: SelfReview };
function requireData<T>(data: T | undefined | null): T {
  if (!data) throw new Error("We couldn't load this record. Please try again.");
  return data;
}
export async function listAgreements(page = 1) {
  const r = await apiRequest<Agreement[]>(`${base}/agreements?page=${page}&pageSize=20`);
  return { items: r.data ?? [], total: r.meta?.total ?? 0 };
}
export async function saveAgreement(input: AgreementInput, id?: string, token?: string) {
  const path = id ? `/${id}?concurrencyToken=${encodeURIComponent(token ?? "")}` : "";
  return requireData((await apiRequest<Agreement>(`${base}/agreements${path}`, { method: id ? "PUT" : "POST", body: input })).data);
}
export async function agreementAction(a: Agreement, action: "approve" | "close", reference: string, selfReview?: SelfReview) {
  return requireData((await apiRequest<Agreement>(`${base}/agreements/${a.id}/${action}`, {
    method: "POST", body: { concurrencyToken: a.concurrencyToken, reference, ...(selfReview?{selfReview}:{}) },
  })).data);
}
export async function listDispatches(page = 1) {
  const r = await apiRequest<ConsignmentDispatch[]>(`${base}/dispatches?page=${page}&pageSize=20`);
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
function saveBlob(blob: Blob,fileName: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a"); link.href = url;
    link.download = fileName; document.body.append(link); link.click(); link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url),0); }
}
