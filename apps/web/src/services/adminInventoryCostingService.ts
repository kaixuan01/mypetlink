import { apiRequest } from "@/services/apiClient";

export type ReceiptCostMode = "Simple" | "Detailed";

export type InventoryReceiptBatchOption = {
  id: string;
  batchNumber: string;
  generatedQuantity: number;
  unreceivedEligibleQuantity: number;
};

export type InventoryReceiptSkuOption = {
  id: string;
  sku: string;
  productName: string;
  variantName: string;
  batches: InventoryReceiptBatchOption[];
};

export type InventoryReceipt = {
  id: string;
  receiptNumber: string;
  productVariantId: string;
  sku: string;
  productName: string;
  smartTagBatchId?: string | null;
  batchNumber?: string | null;
  quantityReceived: number;
  receivedAt: string;
  supplierName?: string | null;
  supplierReference?: string | null;
  purchaseCurrency: string;
  exchangeRateToMyr: number;
  costMode: ReceiptCostMode;
  totalLandedCostMyr: number;
  unitLandedCostMyr: number;
  correctsReceiptId?: string | null;
  correctionReason?: string | null;
  /** Set once a later receipt corrected this one. History only; not live stock. */
  supersededAt?: string | null;
  supersededByReceiptId?: string | null;
  rowVersion: string;
};

export type CreateInventoryReceiptInput = {
  productVariantId: string;
  smartTagBatchId?: string;
  quantityReceived: number;
  receivedAt: string;
  supplierName?: string;
  supplierReference?: string;
  notes?: string;
  purchaseCurrency: string;
  exchangeRateToMyr?: number;
  costMode: ReceiptCostMode;
  unitLandedCostMyr?: number;
  goodsCost?: number;
  freightCost?: number;
  customsTaxCost?: number;
  otherLandedCost?: number;
  correctsReceiptId?: string;
  correctionReason?: string;
  /** Required when correcting: the corrected receipt's concurrency token. */
  correctsReceiptRowVersion?: string;
};

export type ProfitabilityOrder = {
  channel: string;
  orderId: string;
  orderNumber: string;
  costSnapshotAt: string;
  sellingAmount: number;
  costOfGoods?: number | null;
  grossProfit?: number | null;
  units: number;
  uncostedUnits: number;
  isFullyCosted: boolean;
};

export type ProfitabilityExcludedOrder = {
  channel: string;
  orderId: string;
  orderNumber: string;
  reason: string;
  originalSellingAmount: number;
};

/**
 * The costed figures cover only orders where every unit carries a real stock
 * cost, so they stand on their own. The uncosted figures carry the rest:
 * revenue is reported, cost is never estimated, and no margin is offered.
 */
export type ProfitabilityReport = {
  from: string;
  to: string;
  productRevenue: number;
  discounts: number;
  netProductRevenue: number;
  unitsSold: number;
  costedNetRevenue: number;
  costedUnits: number;
  costedCostOfGoods: number;
  costedGrossProfit: number;
  costedGrossMarginPercentage?: number | null;
  uncostedNetRevenue: number;
  uncostedUnits: number;
  isCostOfGoodsComplete: boolean;
  recordedCourierCost: number;
  ordersMissingCourierCost: number;
  recordedSalesCommission: number;
  costedCourierCost: number;
  costedSalesCommission: number;
  contributionProfit?: number | null;
  excludedOrders: ProfitabilityExcludedOrder[];
  excludedCosts: string[];
  orders: ProfitabilityOrder[];
};

export async function listInventoryReceiptOptions() {
  const response = await apiRequest<InventoryReceiptSkuOption[]>(
    "/api/v1/admin/tag-inventory/receipt-options"
  );
  return response.data ?? [];
}

export async function listInventoryReceipts() {
  const response = await apiRequest<InventoryReceipt[]>(
    "/api/v1/admin/tag-inventory/receipts?page=1&pageSize=50"
  );
  return response.data ?? [];
}

export async function createInventoryReceipt(input: CreateInventoryReceiptInput) {
  const response = await apiRequest<InventoryReceipt>(
    "/api/v1/admin/tag-inventory/receipts",
    { method: "POST", body: input }
  );
  if (!response.data) throw new Error("The stock receipt could not be saved.");
  return response.data;
}

export async function getProfitabilityReport(from: string, toExclusive: string) {
  const query = new URLSearchParams({ from, to: toExclusive });
  const response = await apiRequest<ProfitabilityReport>(
    `/api/v1/admin/tag-inventory/profitability?${query.toString()}`
  );
  if (!response.data) throw new Error("The profitability report could not be loaded.");
  return response.data;
}
