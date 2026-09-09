import { triggerDownload } from "@/lib/adminListShared";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import type { AdminPagedResult } from "@/services/adminMerchantSalesService";

const base = "/api/v1/admin/merchant-sales/commission-payouts";

export type CommissionPayoutStatus = "Prepared" | "Paid" | "Cancelled";
export type CommissionPayoutPaymentMethod =
  | "BankTransfer"
  | "DuitNow"
  | "Cheque"
  | "Cash"
  | "Other";

export type CommissionPayoutSummary = {
  id: string;
  payoutNumber: string;
  salespersonId: string;
  salespersonCode: string;
  salespersonName: string;
  periodFrom: string;
  periodToExclusive: string;
  currency: string;
  preparedAmount: number;
  status: CommissionPayoutStatus;
  itemCount: number;
  recoveryExposure: number;
  preparedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  paymentMethod: CommissionPayoutPaymentMethod | null;
  paymentReference: string | null;
  concurrencyToken: string;
};

export type CommissionPayoutItem = {
  id: string;
  salesCommissionId: string;
  sourceType: "MerchantOrder" | "TagOrder";
  commissionType:
    | "MerchantOrderPercentage"
    | "DirectRetailPercentage"
    | "ResellerAcquisitionBonus"
    | "ResellerRepeatPercentage";
  merchantOrderId: string | null;
  tagOrderId: string | null;
  sourceOrderNumber: string;
  commissionBaseAmount: number;
  commissionAmount: number;
  commissionPercentage: number | null;
  commissionFixedAmount: number | null;
  currency: string;
  calculatedAt: string;
  currentCommissionStatus: "Payable" | "Paid" | "Reversed" | "Missing";
  reversedAt: string | null;
  reversalReason: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  requiresRecovery: boolean;
};

export type PayoutSellerSnapshot = {
  brandName: string;
  legalBusinessName: string;
  businessRegistrationNumber: string;
  taxIdentificationNumber: string | null;
  sstRegistrationNumber: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  city: string;
  state: string;
  country: string;
  supportEmail: string;
};

export type CommissionPayout = {
  summary: CommissionPayoutSummary;
  seller: PayoutSellerSnapshot;
  preparedByAdminUserId: string;
  preparedBy: string;
  paidByAdminUserId: string | null;
  paidBy: string | null;
  paymentMethod: CommissionPayoutPaymentMethod | null;
  paymentReference: string | null;
  notes: string | null;
  cancelledByAdminUserId: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  items: CommissionPayoutItem[];
};

export type CommissionPayoutListParams = {
  page: number;
  pageSize: number;
  salespersonId?: string;
  status?: string;
  from?: string;
  toExclusive?: string;
  payoutNumber?: string;
};

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

function must<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`The ${label} was not returned.`);
  return value;
}

export async function listCommissionPayouts(
  params: CommissionPayoutListParams,
  signal?: AbortSignal
): Promise<AdminPagedResult<CommissionPayoutSummary>> {
  const response = await apiRequest<CommissionPayoutSummary[]>(
    `${base}?${query({ ...params })}`,
    { signal }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function getCommissionPayout(id: string, signal?: AbortSignal) {
  const response = await apiRequest<CommissionPayout>(`${base}/${id}`, { signal });
  return must(response.data, "commission payout");
}

export async function prepareCommissionPayout(input: {
  salesCommissionIds: string[];
  salespersonId: string;
  periodFrom: string;
  periodToExclusive: string;
  expectedTotal: number;
  idempotencyKey: string;
  notes: string | null;
}) {
  const response = await apiRequest<CommissionPayout>(base, { method: "POST", body: input });
  return must(response.data, "commission payout");
}

export async function markCommissionPayoutPaid(
  id: string,
  input: {
    concurrencyToken: string;
    paymentMethod: CommissionPayoutPaymentMethod;
    paymentReference: string;
  }
) {
  const response = await apiRequest<CommissionPayout>(`${base}/${id}/mark-paid`, {
    method: "POST",
    body: input,
  });
  return must(response.data, "commission payout");
}

export async function cancelCommissionPayout(
  id: string,
  concurrencyToken: string,
  reason: string
) {
  const response = await apiRequest<CommissionPayout>(`${base}/${id}/cancel`, {
    method: "POST",
    body: { concurrencyToken, reason },
  });
  return must(response.data, "commission payout");
}

export async function downloadCommissionPayoutStatement(id: string, payoutNumber: string) {
  const { blob, fileName } = await apiRequestBlob(`${base}/${id}/statement`);
  triggerDownload(blob, fileName ?? `MyPetLink-Commission-Payout-Statement-${payoutNumber}.pdf`);
}
