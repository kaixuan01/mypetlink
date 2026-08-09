import { apiRequest, isApiClientError } from "@/services/apiClient";
import type { MerchantAddress } from "@/services/adminMerchantSalesService";

// Admin-only. Internal courier cost, internal shipping notes and release
// reasons live here because every consumer is an authenticated admin; none of
// it belongs on a merchant document or in a merchant email.

const base = "/api/v1/admin/merchant-sales/orders";

// --- Types -----------------------------------------------------------------

export type MerchantAllocationBatch = {
  batchId: string | null;
  batchNo: string;
  quantity: number;
};

export type MerchantItemAllocationProgress = {
  merchantOrderItemId: string;
  productVariantId: string;
  productName: string;
  skuCode: string;
  optionName: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  requiredUnits: number;
  allocatedUnits: number;
  remainingUnits: number;
  isFullyAllocated: boolean;
  eligibleAvailableUnits: number;
  batches: MerchantAllocationBatch[];
};

export type MerchantAllocationSummary = {
  merchantOrderId: string;
  merchantOrderNumber: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  allocationAllowed: boolean;
  allocationBlockedReason: string | null;
  requiredUnits: number;
  allocatedUnits: number;
  remainingUnits: number;
  isFullyAllocated: boolean;
  canMarkReadyToShip: boolean;
  items: MerchantItemAllocationProgress[];
  concurrencyToken: string;
};

export type MerchantAllocatedTag = {
  id: string;
  merchantOrderItemId: string;
  smartTagId: string;
  tagCode: string;
  batchNo: string | null;
  status: string;
  allocatedAt: string;
  wasAutomatic: boolean;
  sentToMerchantAt: string | null;
  releasedAt: string | null;
  releasedReason: string | null;
  concurrencyToken: string;
};

export type MerchantEligibleInventoryItem = {
  smartTagId: string;
  tagCode: string;
  batchId: string | null;
  batchNo: string | null;
  fulfilmentStatus: string;
  printedAt: string | null;
  createdAt: string;
};

export type MerchantDeliveryOrderItem = {
  merchantOrderItemId: string;
  productName: string;
  skuCode: string;
  optionName: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  orderedQuantity: number;
  allocatedQuantity: number;
  batchSummary: string;
};

export type MerchantDeliveryOrder = {
  id: string;
  deliveryOrderNumber: string;
  merchantOrderId: string;
  merchantOrderNumber: string;
  merchantCode: string;
  merchantLegalName: string;
  merchantTradingName: string | null;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  deliveryAddress: MerchantAddress;
  courierProvider: string | null;
  courierService: string | null;
  trackingNumber: string | null;
  issuedAt: string;
  items: MerchantDeliveryOrderItem[];
  concurrencyToken: string;
};

export type MerchantOrderFulfilment = {
  merchantOrderId: string;
  merchantOrderNumber: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  courierProviderCode: string | null;
  courierProvider: string | null;
  courierService: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  internalCourierCost: number | null;
  internalShippingNotes: string | null;
  preparingAt: string | null;
  readyToShipAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  allocation: MerchantAllocationSummary;
  deliveryOrder: MerchantDeliveryOrder | null;
  concurrencyToken: string;
};

// --- Reads -----------------------------------------------------------------

export async function getAllocationSummary(orderId: string, signal?: AbortSignal) {
  const response = await apiRequest<MerchantAllocationSummary>(
    `${base}/${orderId}/allocation`,
    { signal }
  );
  return must(response.data, "allocation summary");
}

export async function getFulfilment(orderId: string, signal?: AbortSignal) {
  const response = await apiRequest<MerchantOrderFulfilment>(
    `${base}/${orderId}/fulfilment`,
    { signal }
  );
  return must(response.data, "fulfilment");
}

export async function listAllocatedTags(
  orderId: string,
  includeReleased = false,
  signal?: AbortSignal
) {
  const response = await apiRequest<MerchantAllocatedTag[]>(
    `${base}/${orderId}/allocation/tags?includeReleased=${includeReleased}`,
    { signal }
  );
  return response.data ?? [];
}

export type EligibleInventoryParams = {
  merchantOrderItemId: string;
  page: number;
  pageSize: number;
  search?: string;
  batchId?: string;
};

export async function listEligibleInventory(
  orderId: string,
  params: EligibleInventoryParams,
  signal?: AbortSignal
) {
  const search = new URLSearchParams({
    merchantOrderItemId: params.merchantOrderItemId,
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search?.trim()) search.set("search", params.search.trim());
  if (params.batchId) search.set("batchId", params.batchId);

  const response = await apiRequest<MerchantEligibleInventoryItem[]>(
    `${base}/${orderId}/allocation/eligible-inventory?${search}`,
    { signal }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

// --- Allocation ------------------------------------------------------------

export async function allocateTags(
  orderId: string,
  input: { merchantOrderItemId: string; smartTagIds: string[]; concurrencyToken?: string | null }
) {
  const response = await apiRequest<MerchantAllocationSummary>(`${base}/${orderId}/allocation`, {
    method: "POST",
    body: input,
  });
  return must(response.data, "allocation summary");
}

export async function autoAllocateTags(
  orderId: string,
  input: { merchantOrderItemId: string; quantity: number; concurrencyToken?: string | null }
) {
  const response = await apiRequest<MerchantAllocationSummary>(
    `${base}/${orderId}/allocation/auto`,
    { method: "POST", body: input }
  );
  return must(response.data, "allocation summary");
}

export async function releaseAllocations(
  orderId: string,
  input: { allocationIds: string[]; reason: string; concurrencyToken?: string | null }
) {
  const response = await apiRequest<MerchantAllocationSummary>(
    `${base}/${orderId}/allocation/release`,
    { method: "POST", body: input }
  );
  return must(response.data, "allocation summary");
}

// --- Fulfilment ------------------------------------------------------------

export async function markPreparing(orderId: string, concurrencyToken?: string | null) {
  const response = await apiRequest<MerchantOrderFulfilment>(
    `${base}/${orderId}/fulfilment/preparing`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "fulfilment");
}

export async function markReadyToShip(orderId: string, concurrencyToken?: string | null) {
  const response = await apiRequest<MerchantOrderFulfilment>(
    `${base}/${orderId}/fulfilment/ready-to-ship`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "fulfilment");
}

export type MarkShippedInput = {
  courierProviderCode?: string | null;
  courierProviderName?: string | null;
  courierService?: string | null;
  trackingNumber: string;
  internalCourierCost?: number | null;
  internalShippingNotes?: string | null;
  concurrencyToken?: string | null;
};

export async function markShipped(orderId: string, input: MarkShippedInput) {
  const response = await apiRequest<MerchantOrderFulfilment>(
    `${base}/${orderId}/fulfilment/shipped`,
    { method: "POST", body: input }
  );
  return must(response.data, "fulfilment");
}

export async function markDelivered(orderId: string, concurrencyToken?: string | null) {
  const response = await apiRequest<MerchantOrderFulfilment>(
    `${base}/${orderId}/fulfilment/delivered`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "fulfilment");
}

/**
 * Records the delivery note for a shipment. The server issues one document per
 * merchant order and returns the existing one when asked again, so calling this
 * after a transition that already produced it is safe.
 */
export async function issueDeliveryOrder(orderId: string) {
  const response = await apiRequest<MerchantDeliveryOrder>(
    `${base}/${orderId}/delivery-order`,
    { method: "POST", body: {} }
  );
  return must(response.data, "delivery order");
}

// --- Failure wording -------------------------------------------------------

/**
 * Every typed code the allocation and fulfilment API can answer with, turned
 * into a sentence that says what happened and what to do next. The raw code
 * never reaches the screen.
 */
export function getMerchantFulfilmentError(error: unknown, fallback: string): string {
  if (!isApiClientError(error)) return fallback;

  switch (error.code) {
    case "payment_not_confirmed":
      return "Inventory can be allocated once the merchant's payment is confirmed.";
    case "order_cancelled":
      return "This merchant order was cancelled, so its inventory cannot be changed.";
    case "allocation_not_allowed":
      return "This order has shipped, so its inventory can no longer be changed.";
    case "inventory_not_eligible":
      return "One or more of those tags are no longer available. Reload the list and choose again.";
    case "sku_mismatch":
      return "One of those tags belongs to a different product option. Choose tags for this SKU only.";
    case "inventory_already_allocated":
      return "Another order took one or more of those tags first. Reload the list and choose again.";
    case "insufficient_inventory":
      // The server names the SKU and the exact shortfall; that detail is the value.
      return error.message;
    case "allocation_exceeds_order_quantity":
      return error.message;
    case "allocation_incomplete":
      return error.message;
    case "invalid_fulfilment_transition":
      return error.message;
    case "tracking_required":
      return "Enter the tracking number before marking this order shipped.";
    case "delivery_order_not_ready":
      return "Mark the order ready to ship before issuing its delivery order.";
    case "delivery_order_already_issued":
      return "A delivery order has already been issued for this merchant order.";
    case "merchant_order_not_cancellable":
      return "A paid merchant order cannot be cancelled here. Release its inventory instead.";
    case "concurrency_conflict":
      return "Inventory changed while you were working. The latest availability has been loaded.";
    case "inventory_busy":
      return "Inventory is being updated by someone else. Try again in a moment.";
    case "validation_failed":
      return "Please check the highlighted fields and try again.";
    case "merchant_order_not_found":
    case "merchant_order_item_not_found":
      return "That order is no longer available. It may have been removed.";
    default:
      break;
  }

  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to do that.";
  if (error.status === 404) return "That record no longer exists. It may have been removed.";
  if (error.status === 0) {
    return "We couldn’t connect right now. Check your connection and try again.";
  }

  return fallback;
}

/** True when the failure means the page's view of stock is out of date. */
export function isStaleInventory(error: unknown): boolean {
  return (
    isApiClientError(error) &&
    ["concurrency_conflict", "inventory_already_allocated", "inventory_not_eligible",
      "inventory_busy", "insufficient_inventory"].includes(error.code)
  );
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`The ${what} was not returned.`);
  }
  return value;
}
