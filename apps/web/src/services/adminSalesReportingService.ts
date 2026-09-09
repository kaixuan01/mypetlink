import { triggerDownload } from "@/lib/adminListShared";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import type { AdminPagedResult } from "@/services/adminMerchantSalesService";

const base = "/api/v1/admin/merchant-sales/reports";

export type SalesReportParams = {
  from: string;
  toExclusive: string;
  salespersonId?: string;
  channel?: "all" | "retail" | "merchant";
  commissionType?: string;
};

export type RetailPerformanceMetrics = {
  attributedPaidOrders: number;
  unitsSold: number;
  attributedRevenue: number;
  commissionEligibleOrders: number;
  commissionEligibleUnits: number;
  commissionEligibleRevenue: number;
};

export type MerchantPerformanceMetrics = {
  paidOrders: number;
  netWholesaleRevenue: number;
  newResellerActivations: number;
};

export type RelationshipMetrics = {
  resellersAcquired: number;
  active: number;
  endingSoon: number;
  expired: number;
  notActivated: number;
};

export type RankingItem = {
  salespersonId: string;
  salespersonCode: string;
  salespersonName: string;
  value: number;
};

export type SalesPerformanceReport = {
  range: { from: string; toExclusive: string };
  retail: RetailPerformanceMetrics;
  merchant: MerchantPerformanceMetrics;
  relationships: RelationshipMetrics;
  directRevenueRanking: RankingItem[];
  directUnitsRanking: RankingItem[];
  resellerActivationRanking: RankingItem[];
};

export type CommissionAccounting = {
  grossGenerated: number;
  currentValid: number;
  payable: number;
  currentPaid: number;
  reversed: number;
  cashPaidDuringPeriod: number;
  reversedDuringPeriod: number;
  currency: string;
};

export type CommissionFinancialReport = {
  range: { from: string; toExclusive: string };
  accounting: CommissionAccounting;
  commissionGeneratedRanking: RankingItem[];
};

export type SalespersonPerformanceReport = {
  salespersonId: string;
  salespersonCode: string;
  salespersonName: string;
  range: { from: string; toExclusive: string };
  retail: RetailPerformanceMetrics;
  merchant: MerchantPerformanceMetrics;
  repeatPaidOrders: number;
  repeatEligibleRevenue: number;
  lifetimeWholesaleRevenue: number;
};

export type SalespersonFinancialReport = {
  salespersonId: string;
  range: { from: string; toExclusive: string };
  directCommissionGenerated: number;
  directCommissionReversed: number;
  acquisitionBonusGenerated: number;
  repeatCommissionGenerated: number;
  accounting: CommissionAccounting;
};

export type ResellerPortfolioItem = {
  merchantId: string;
  merchantCode: string;
  merchantName: string;
  commissionPlan: string;
  acquiredBySalespersonId: string | null;
  acquiredBySalespersonCode: string | null;
  acquiredBySalespersonName: string | null;
  assignedSalespersonId: string | null;
  assignedSalespersonCode: string | null;
  assignedSalespersonName: string | null;
  activationDate: string | null;
  activationOrderId: string | null;
  activationOrderNumber: string | null;
  repeatEligibleUntil: string | null;
  relationshipState: "NotActivated" | "Active" | "EndingSoon" | "Expired";
  lifetimeWholesaleRevenue: number;
  repeatEligibleRevenue: number;
};

export type ResellerPortfolioFinancialItem = {
  merchantId: string;
  repeatCommissionPercentage: number | null;
  acquisitionBonusGenerated: number;
  repeatCommissionGenerated: number;
  currency: string;
};

function query(params: object) {
  const values = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") values.set(key, String(value));
  });
  return values.toString();
}

async function get<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal) {
  const response = await apiRequest<T>(`${path}?${query(params)}`, { signal });
  if (!response.data) throw new Error("The report was not returned.");
  return response.data;
}

export const getSalesPerformanceReport = (params: SalesReportParams, signal?: AbortSignal) =>
  get<SalesPerformanceReport>(`${base}/performance`, params, signal);

export const getCommissionFinancialReport = (params: SalesReportParams, signal?: AbortSignal) =>
  get<CommissionFinancialReport>(`${base}/financial`, params, signal);

export const getSalespersonPerformanceReport = (id: string, params: SalesReportParams, signal?: AbortSignal) =>
  get<SalespersonPerformanceReport>(`${base}/salespersons/${id}/performance`, params, signal);

export const getSalespersonFinancialReport = (id: string, params: SalesReportParams, signal?: AbortSignal) =>
  get<SalespersonFinancialReport>(`${base}/salespersons/${id}/financial`, params, signal);

export async function listResellerPortfolio(
  id: string,
  params: { page: number; pageSize: number; search?: string; state?: string },
  signal?: AbortSignal
): Promise<AdminPagedResult<ResellerPortfolioItem>> {
  const response = await apiRequest<ResellerPortfolioItem[]>(
    `${base}/salespersons/${id}/reseller-portfolio?${query(params)}`, { signal }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function listResellerPortfolioFinancial(
  id: string,
  params: { page: number; pageSize: number; search?: string; state?: string },
  signal?: AbortSignal
): Promise<AdminPagedResult<ResellerPortfolioFinancialItem>> {
  const response = await apiRequest<ResellerPortfolioFinancialItem[]>(
    `${base}/salespersons/${id}/reseller-portfolio-financial?${query(params)}`, { signal }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function downloadCommissionLedger(params: Record<string, string | number | undefined>) {
  const { blob, fileName } = await apiRequestBlob(
    `/api/v1/admin/merchant-sales/commissions/export?${query(params)}`
  );
  triggerDownload(blob, fileName ?? "mypetlink-commission-ledger.csv");
}

export async function downloadResellerPortfolio(
  salespersonId: string,
  params: { search?: string; state?: string }
) {
  const { blob, fileName } = await apiRequestBlob(
    `${base}/salespersons/${salespersonId}/reseller-portfolio/export?${query(params)}`
  );
  triggerDownload(blob, fileName ?? "mypetlink-reseller-relationships.csv");
}
