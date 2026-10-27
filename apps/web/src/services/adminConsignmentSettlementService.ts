import { triggerDownload } from "@/lib/adminListShared";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";

// Consignment settlements: what a partner branch owes for a verified period,
// what they paid, and the sales commission the period carries. Admin only.

const base = "/api/v1/admin/merchant-sales/consignment-settlements";

export type SettlementStatus = "AwaitingPayment" | "PartiallyReceived" | "Settled" | "CreditDue";
export type SettlementAttention = "" | "attribution" | "outstanding" | "recovery";
export type PartnerPaymentMethod = "BankTransfer" | "DuitNow" | "Cheque" | "Cash" | "Other";

export type SettlementSummary = {
  id: string;
  settlementNumber: string;
  merchantId: string;
  merchantName: string;
  merchantBranchId: string;
  branchName: string;
  periodStart: string;
  periodEndExclusive: string;
  salesReportId: string;
  salesReportVersion: number;
  revision: number;
  status: SettlementStatus;
  standardQuantity: number;
  standardSales: number;
  promotionQuantity: number;
  promotionSales: number;
  refundQuantity: number;
  refundAmount: number;
  eligibleSales: number;
  merchantCommission: number;
  expectedRemittance: number;
  receivedAmount: number;
  outstanding: number;
  creditDue: number;
  attributionStatus: "Resolved" | "NeedsResolution";
  attributionIssue: string | null;
  attributionSource: "ServicingAssignment" | "OperatorResolution" | null;
  salespersonId: string | null;
  salespersonName: string | null;
  commissionPolicyCode: string | null;
  commissionPending: number;
  commissionPayable: number;
  commissionPaid: number;
  commissionRecoveryRequired: number;
  commissionNote: string | null;
  concurrencyToken: string;
};

export type SettlementLine = {
  sourceReportLineId: string;
  lineType: "Sale" | "Refund";
  sku: string;
  priceKind: "Standard" | "Promotion";
  unitPrice: number;
  quantity: number;
  amount: number;
  merchantCommissionPercentage: number;
  refundOfPeriodStart: string | null;
  commissionSalespersonId: string | null;
  commissionUnitAmount: number | null;
};

export type SettlementRevision = {
  revision: number;
  salesReportId: string;
  salesReportVersion: number;
  reason: string;
  eligibleSales: number;
  merchantCommission: number;
  expectedRemittance: number;
  salesCommissionTarget: number;
  commissionRecoveryRequired: number;
  createdAt: string;
};

export type SettlementReceipt = {
  id: string;
  receivedOn: string;
  amount: number;
  method: PartnerPaymentMethod;
  reference: string;
  notes: string | null;
  recordedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  concurrencyToken: string;
};

export type SettlementCommission = {
  id: string;
  salespersonId: string;
  salespersonName: string;
  commissionType: "ConsignmentStandardPerUnit" | "ConsignmentPromotionPerUnit";
  qualifiedQuantity: number;
  unitAmount: number;
  commissionAmount: number;
  status: "Pending" | "Payable" | "Paid" | "Reversed";
  revision: number;
  policyCode: string | null;
  calculatedAt: string;
  payableAt: string | null;
  paidAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  payoutNumber: string | null;
  payoutClaimState: "Unclaimed" | "ReservedInPreparedPayout" | "IncludedInPaidPayout";
};

export type Settlement = {
  summary: SettlementSummary;
  agreementReference: string;
  agreementVersion: number;
  lines: SettlementLine[];
  revisions: SettlementRevision[];
  receipts: SettlementReceipt[];
  commissions: SettlementCommission[];
  attributionResolvedAt: string | null;
  attributionResolutionReason: string | null;
  /** Recovery obligations in force that were paid in this period or caused by its report. One row, one amount owed. */
  currentRecoveries?: SettlementRecovery[];
};

export type SettlementRecovery = {
  /** The stored obligation's own key. Two obligations can match in every other field, so rows are told apart by this. */
  recoveryId: string;
  originSettlementId: string;
  originSettlementNumber: string;
  originPeriodStart: string;
  causedBySettlementId: string;
  causedBySettlementNumber: string;
  causedByPeriodStart: string;
  salespersonName: string;
  payoutNumber: string | null;
  quantity: number;
  unitAmount: number;
  amount: number;
};

function must<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`The ${label} was not returned.`);
  return value;
}

export async function listSettlements(
  page = 1,
  filters: { merchantId?: string; status?: SettlementStatus | ""; attention?: SettlementAttention } = {},
  pageSize = 20,
) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const response = await apiRequest<SettlementSummary[]>(`${base}?${params.toString()}`);
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function getSettlement(id: string) {
  return must((await apiRequest<Settlement>(`${base}/${id}`)).data, "settlement");
}

export async function recordPartnerPayment(
  id: string,
  input: { receivedOn: string; amount: number; method: PartnerPaymentMethod; reference: string; notes: string | null; idempotencyKey: string },
) {
  return must((await apiRequest<Settlement>(`${base}/${id}/receipts`, { method: "POST", body: input })).data, "settlement");
}

export async function voidPartnerPayment(id: string, receipt: SettlementReceipt, reason: string) {
  return must((await apiRequest<Settlement>(`${base}/${id}/receipts/${receipt.id}/void`, {
    method: "POST", body: { reason, concurrencyToken: receipt.concurrencyToken },
  })).data, "settlement");
}

export async function resolveSettlementAttribution(summary: SettlementSummary, salespersonId: string | null, reason: string) {
  return must((await apiRequest<Settlement>(`${base}/${summary.id}/resolve-attribution`, {
    method: "POST", body: { salespersonId, reason, concurrencyToken: summary.concurrencyToken },
  })).data, "settlement");
}

export async function recalculateSettlement(summary: SettlementSummary, reason: string) {
  return must((await apiRequest<Settlement>(`${base}/${summary.id}/recalculate`, {
    method: "POST", body: { reason, concurrencyToken: summary.concurrencyToken },
  })).data, "settlement");
}

export async function downloadSettlementStatement(summary: SettlementSummary) {
  const { blob, fileName } = await apiRequestBlob(`${base}/${summary.id}/statement.csv`);
  triggerDownload(blob, fileName ?? `MyPetLink-Consignment-Settlement-${summary.settlementNumber}.csv`);
}

// --- Salesperson commission terms ------------------------------------------

export type CommissionTerms = {
  id: string;
  salespersonId: string;
  policyCode: string;
  acceptedAt: string;
  effectiveFrom: string;
  effectiveToExclusive: string | null;
  agreementReference: string;
  notes: string | null;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
  concurrencyToken: string;
};

const termsBase = (salespersonId: string) => `/api/v1/admin/merchant-sales/salespersons/${salespersonId}/commission-policies`;

export async function listCommissionTerms(salespersonId: string) {
  return (await apiRequest<CommissionTerms[]>(termsBase(salespersonId))).data ?? [];
}

export async function recordCommissionTerms(
  salespersonId: string,
  input: { policyCode: string; acceptedAt: string; effectiveFrom: string; agreementReference: string; notes: string | null },
) {
  return must((await apiRequest<CommissionTerms>(termsBase(salespersonId), { method: "POST", body: input })).data, "commission terms");
}

export async function endCommissionTerms(terms: CommissionTerms, effectiveToExclusive: string, reason: string) {
  return must((await apiRequest<CommissionTerms>(`${termsBase(terms.salespersonId)}/${terms.id}/end`, {
    method: "POST", body: { effectiveToExclusive, reason, concurrencyToken: terms.concurrencyToken },
  })).data, "commission terms");
}
