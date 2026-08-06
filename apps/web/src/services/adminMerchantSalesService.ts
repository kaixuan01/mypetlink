import { apiRequest, isApiClientError } from "@/services/apiClient";

// Admin-only Merchant Sales API. Every total, status and transition is decided
// by the server; nothing here recalculates money or infers a lifecycle state.

const base = "/api/v1/admin/merchant-sales";

export type MerchantAddress = {
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  city: string;
  state: string;
  country: string;
};

export type AdminMerchant = {
  id: string;
  merchantCode: string;
  legalBusinessName: string;
  tradingName: string | null;
  businessRegistrationNumber: string | null;
  taxIdentificationNumber: string | null;
  sstRegistrationNumber: string | null;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  billingAddress: MerchantAddress;
  deliveryAddressSameAsBilling: boolean;
  deliveryAddress: MerchantAddress;
  assignedSalespersonId: string | null;
  assignedSalespersonName: string | null;
  paymentTerm: string;
  internalNotes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  concurrencyToken: string;
};

export type AdminSalesperson = {
  id: string;
  salespersonCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  defaultCommissionPercentage: number;
  internalNotes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  concurrencyToken: string;
};

export type AdminQuotationItem = {
  id: string;
  productId: string;
  productVariantId: string;
  productName: string;
  skuCode: string;
  optionName: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  quantity: number;
  wholesaleUnitPrice: number;
  lineDiscount: number;
  lineSubtotal: number;
  sortOrder: number;
};

export type QuotationStatus =
  | "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired" | "Converted" | "Cancelled";

export type AdminQuotation = {
  id: string;
  quotationNumber: string;
  merchantId: string;
  merchantCode: string;
  merchantLegalName: string;
  merchantTradingName: string | null;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  billingAddress: MerchantAddress;
  deliveryAddress: MerchantAddress;
  salespersonId: string | null;
  salespersonCode: string | null;
  salespersonName: string | null;
  quotationDate: string;
  validUntil: string;
  currency: string;
  paymentTerm: string;
  merchandiseSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  grandTotal: number;
  customerNotes: string | null;
  internalNotes: string | null;
  status: QuotationStatus;
  convertedMerchantOrderId: string | null;
  convertedMerchantOrderNumber: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  convertedAt: string | null;
  cancelledAt: string | null;
  items: AdminQuotationItem[];
  concurrencyToken: string;
};

export type MerchantPaymentStatus = "AwaitingPayment" | "PaymentConfirmed" | "Cancelled";

export type AdminMerchantOrder = {
  id: string;
  merchantOrderNumber: string;
  sourceQuotationId: string | null;
  sourceQuotationNumber: string | null;
  merchantId: string;
  merchantCode: string;
  merchantLegalName: string;
  merchantTradingName: string | null;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  billingAddress: MerchantAddress;
  deliveryAddress: MerchantAddress;
  salespersonId: string | null;
  salespersonCode: string | null;
  salespersonName: string | null;
  paymentTerm: string;
  currency: string;
  merchandiseSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  grandTotal: number;
  paymentStatus: MerchantPaymentStatus;
  fulfilmentStatus: string;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  paymentConfirmedAt: string | null;
  cancelledAt: string | null;
  items: AdminQuotationItem[];
  concurrencyToken: string;
  // Operational summary carried by the listing, so a table of a hundred rows
  // still costs one request instead of one summary call per row.
  requiredUnits: number;
  allocatedUnits: number;
  courierProvider: string | null;
  courierService: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

/** One rendered fulfilment event. The server writes the sentence, not the client. */
export type AdminMerchantOrderTimelineEntry = {
  action: string;
  summary: string;
  actorName: string | null;
  occurredAt: string;
};

export type AdminPagedResult<T> = { items: T[]; total: number };

async function paged<T>(path: string, signal?: AbortSignal): Promise<AdminPagedResult<T>> {
  const response = await apiRequest<T[]>(path, { signal });
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// --- Merchants -------------------------------------------------------------

export type MerchantListParams = {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  salespersonId?: string;
  state?: string;
};

export function listMerchants(params: MerchantListParams, signal?: AbortSignal) {
  return paged<AdminMerchant>(`${base}/merchants${query({ ...params })}`, signal);
}

export type UpsertMerchantInput = {
  legalBusinessName: string;
  tradingName: string | null;
  businessRegistrationNumber: string | null;
  taxIdentificationNumber: string | null;
  sstRegistrationNumber: string | null;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  billingAddress: MerchantAddress;
  deliveryAddressSameAsBilling: boolean;
  deliveryAddress: MerchantAddress | null;
  assignedSalespersonId: string | null;
  internalNotes: string | null;
  concurrencyToken?: string | null;
};

export async function createMerchant(input: UpsertMerchantInput) {
  const response = await apiRequest<AdminMerchant>(`${base}/merchants`, {
    method: "POST",
    body: input,
  });
  return must(response.data, "merchant");
}

export async function updateMerchant(id: string, input: UpsertMerchantInput) {
  const response = await apiRequest<AdminMerchant>(`${base}/merchants/${id}`, {
    method: "PUT",
    body: input,
  });
  return must(response.data, "merchant");
}

export async function setMerchantActive(
  id: string,
  isActive: boolean,
  concurrencyToken: string
) {
  const response = await apiRequest<AdminMerchant>(
    `${base}/merchants/${id}/${isActive ? "activate" : "deactivate"}`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "merchant");
}

// --- Salespersons ----------------------------------------------------------

export function listSalespersons(
  params: { page: number; pageSize: number; search?: string; isActive?: boolean },
  signal?: AbortSignal
) {
  return paged<AdminSalesperson>(`${base}/salespersons${query({ ...params })}`, signal);
}

export type UpsertSalespersonInput = {
  name: string;
  email: string | null;
  phone: string | null;
  defaultCommissionPercentage: number;
  internalNotes: string | null;
  concurrencyToken?: string | null;
};

export async function createSalesperson(input: UpsertSalespersonInput) {
  const response = await apiRequest<AdminSalesperson>(`${base}/salespersons`, {
    method: "POST",
    body: input,
  });
  return must(response.data, "salesperson");
}

export async function updateSalesperson(id: string, input: UpsertSalespersonInput) {
  const response = await apiRequest<AdminSalesperson>(`${base}/salespersons/${id}`, {
    method: "PUT",
    body: input,
  });
  return must(response.data, "salesperson");
}

export async function setSalespersonActive(
  id: string,
  isActive: boolean,
  concurrencyToken: string
) {
  const response = await apiRequest<AdminSalesperson>(
    `${base}/salespersons/${id}/${isActive ? "activate" : "deactivate"}`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "salesperson");
}

// --- Quotations ------------------------------------------------------------

export type QuotationListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  merchantId?: string;
  salespersonId?: string;
  fromDate?: string;
  toDate?: string;
  expired?: boolean;
};

export function listQuotations(params: QuotationListParams, signal?: AbortSignal) {
  return paged<AdminQuotation>(`${base}/quotations${query({ ...params })}`, signal);
}

export async function getQuotation(id: string) {
  const response = await apiRequest<AdminQuotation>(`${base}/quotations/${id}`);
  return must(response.data, "quotation");
}

export type UpsertQuotationItemInput = {
  productVariantId: string;
  quantity: number;
  wholesaleUnitPrice: number;
  lineDiscount: number;
};

export type UpsertQuotationInput = {
  merchantId: string;
  salespersonId: string | null;
  validUntil: string | null;
  discountTotal: number;
  deliveryFee: number;
  customerNotes: string | null;
  internalNotes: string | null;
  items: UpsertQuotationItemInput[];
  concurrencyToken?: string | null;
};

export async function createQuotation(input: UpsertQuotationInput) {
  const response = await apiRequest<AdminQuotation>(`${base}/quotations`, {
    method: "POST",
    body: input,
  });
  return must(response.data, "quotation");
}

export async function updateQuotation(id: string, input: UpsertQuotationInput) {
  const response = await apiRequest<AdminQuotation>(`${base}/quotations/${id}`, {
    method: "PUT",
    body: input,
  });
  return must(response.data, "quotation");
}

export type QuotationTransition =
  | "send" | "accept" | "reject" | "expire" | "cancel";

export async function transitionQuotation(
  id: string,
  transition: QuotationTransition,
  concurrencyToken: string
) {
  const response = await apiRequest<AdminQuotation>(
    `${base}/quotations/${id}/${transition}`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "quotation");
}

export async function convertQuotation(id: string, concurrencyToken: string) {
  const response = await apiRequest<{ order: AdminMerchantOrder; alreadyConverted: boolean }>(
    `${base}/quotations/${id}/convert`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "conversion result");
}

// --- Merchant orders -------------------------------------------------------

export type MerchantOrderListParams = {
  page: number;
  pageSize: number;
  search?: string;
  paymentStatus?: string;
  fulfilmentStatus?: string;
  /** none, incomplete or complete. */
  allocationState?: string;
  courierProviderCode?: string;
  merchantId?: string;
  salespersonId?: string;
  fromDate?: string;
  toDate?: string;
};

export function listMerchantOrders(params: MerchantOrderListParams, signal?: AbortSignal) {
  return paged<AdminMerchantOrder>(`${base}/orders${query({ ...params })}`, signal);
}

export async function getMerchantOrder(id: string) {
  const response = await apiRequest<AdminMerchantOrder>(`${base}/orders/${id}`);
  return must(response.data, "order");
}

export async function getMerchantOrderTimeline(id: string, signal?: AbortSignal) {
  const response = await apiRequest<AdminMerchantOrderTimelineEntry[]>(
    `${base}/orders/${id}/timeline`,
    { signal }
  );
  return response.data ?? [];
}

export async function cancelMerchantOrder(id: string, concurrencyToken: string) {
  const response = await apiRequest<AdminMerchantOrder>(`${base}/orders/${id}/cancel`, {
    method: "POST",
    body: { concurrencyToken },
  });
  return must(response.data, "order");
}

// --- Shared ----------------------------------------------------------------

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`The ${what} was not returned.`);
  }
  return value;
}

/**
 * Turns any failure into wording an administrator can act on. Raw API text is
 * never surfaced: a typed code always wins over the server's message.
 */
export function getMerchantSalesError(error: unknown, fallback: string): string {
  if (!isApiClientError(error)) return fallback;

  switch (error.code) {
    case "concurrency_conflict":
      return "This record was updated by another administrator. Reload the latest version before saving again.";
    case "merchant_registration_duplicate":
    case "merchant_registration_taken":
    case "duplicate_business_registration":
      return "Another merchant already uses that business registration number.";
    case "merchant_inactive":
      return "This merchant is inactive, so a new quotation cannot be created for them.";
    case "salesperson_inactive":
      return "This salesperson is inactive and cannot be assigned to new sales.";
    case "invalid_quotation_transition":
      return "That change is not available for this quotation any more. Reload to see its current status.";
    case "quotation_expired":
      return "This quotation has passed its valid-until date. Issue a new quotation.";
    case "quotation_not_issued":
      return "Send the quotation before producing its document.";
    case "business_identity_incomplete":
      // The server lists exactly what is missing; that detail is the value.
      return error.message;
    case "merchant_order_cancelled":
      return "This order was cancelled, so no invoice can be issued for it.";
    case "merchant_invoice_cancelled":
      return "This invoice was cancelled.";
    case "merchant_invoice_paid":
      return "This invoice has already been paid.";
    case "validation_failed":
      return "Please check the highlighted fields and try again.";
    default:
      break;
  }

  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to do that.";
  if (error.status === 404) return "That record no longer exists. It may have been removed.";
  // A 409 is not always a stale record. When the server has named the reason,
  // telling the operator to reload sends them after the wrong problem.
  if (error.status === 409) {
    return error.message?.trim()
      ? error.message
      : "That action is no longer available. Reload and try again.";
  }
  if (error.status === 0) {
    return "We couldn’t connect right now. Check your connection and try again.";
  }

  return fallback;
}

/** Field-level messages, keyed by the form field they belong to. */
export function getMerchantSalesFieldErrors(error: unknown): Record<string, string> {
  if (!isApiClientError(error) || !error.details) return {};

  const fields: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.details)) {
    const first = messages?.[0];
    if (!first) continue;
    // Nested keys arrive as "BillingAddress.AddressLine1"; lowering only the
    // very first character leaves the rest unmatched and the message unseen.
    const key = field
      .split(".")
      .map((part) => part.charAt(0).toLowerCase() + part.slice(1))
      .join(".");
    fields[key] = first;
  }
  return fields;
}

export function isConcurrencyConflict(error: unknown): boolean {
  return (
    isApiClientError(error) &&
    (error.code === "concurrency_conflict" || error.status === 409 || error.status === 412)
  );
}
