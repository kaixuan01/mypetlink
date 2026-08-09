import { apiRequest, isApiClientError } from "@/services/apiClient";
import { getApiBaseUrl } from "@/services/apiConfig";
import { readStoredAuthSession } from "@/services/authStorage";
import type { AdminPagedResult } from "@/services/adminMerchantSalesService";

// Invoices, payments, receipts, commissions, and the authorized document and
// email actions behind them.

const base = "/api/v1/admin/merchant-sales";

export type AdminInvoiceItem = {
  id: string;
  productName: string;
  skuCode: string;
  optionName: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  quantity: number;
  wholesaleUnitPrice: number;
  grossLineAmount: number;
  lineDiscount: number;
  lineSubtotal: number;
  sortOrder: number;
};

export type AdminMerchantPayment = {
  id: string;
  merchantInvoiceId: string;
  merchantOrderId: string;
  paymentDate: string;
  amountReceived: number;
  currency: string;
  method: string;
  transactionReference: string | null;
  internalNote: string | null;
  paymentProofMediaFileId: string | null;
  recordedBy: string | null;
  recordedAt: string;
};

export type AdminMerchantReceipt = {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMethod: string;
  transactionReference: string | null;
  amountPaid: number;
  currency: string;
  issuedAt: string;
};

export type InvoiceStatus = "Draft" | "Issued" | "Paid" | "Cancelled";

export type AdminMerchantInvoice = {
  id: string;
  invoiceNumber: string;
  merchantOrderId: string;
  merchantOrderNumber: string;
  sourceQuotationNumber: string | null;
  merchantId: string;
  merchantCode: string;
  merchantLegalName: string;
  merchantTradingName: string | null;
  contactPerson: string;
  contactEmail: string;
  invoiceDate: string;
  dueDate: string;
  paymentTerm: string;
  currency: string;
  merchandiseSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  grandTotal: number;
  status: InvoiceStatus;
  issuedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  internalNotes: string | null;
  items: AdminInvoiceItem[];
  payment: AdminMerchantPayment | null;
  receipt: AdminMerchantReceipt | null;
  concurrencyToken: string;
};

export type AdminSalesCommission = {
  id: string;
  merchantOrderId: string;
  merchantOrderNumber: string;
  salespersonId: string;
  salespersonCode: string;
  salespersonName: string;
  commissionPercentage: number;
  commissionBaseAmount: number;
  commissionAmount: number;
  currency: string;
  status: "Payable" | "Paid" | "Reversed";
  calculatedAt: string;
  paidAt: string | null;
  reversedAt: string | null;
  internalNote: string | null;
  concurrencyToken: string;
};

export type RecordPaymentResult = {
  invoice: AdminMerchantInvoice;
  payment: AdminMerchantPayment;
  receipt: AdminMerchantReceipt;
  commission: AdminSalesCommission | null;
  alreadyRecorded: boolean;
};

export type MerchantSalesOverview = {
  activeMerchants: number;
  activeSalespersons: number;
  draftQuotations: number;
  sentQuotations: number;
  acceptedQuotationsAwaitingConversion: number;
  ordersAwaitingInvoice: number;
  invoicesAwaitingPayment: number;
  // Three distinct allocation shapes: nothing allocated, some allocated, and
  // every ordered unit held. A partially allocated order is never counted twice.
  paidOrdersAwaitingAllocation: number;
  partiallyAllocatedOrders: number;
  fullyAllocatedOrders: number;
  ordersReadyToShip: number;
  ordersShipped: number;
  ordersDelivered: number;
  outstandingInvoiceTotal: number;
  payableCommissionTotal: number;
  currency: string;
};

export type MerchantDocumentEmailStatus = {
  relatedId: string;
  messageType: "MerchantQuotation" | "MerchantInvoice" | "MerchantPaymentConfirmation";
  status: "Pending" | "Sending" | "Sent" | "Failed" | "Suppressed";
  suppressionReason: string | null;
  recipientEmail: string;
  sentAt: string | null;
  canRetry: boolean;
};

export type MerchantEmailQueueResult = {
  outboxId: string;
  status: string;
  recipientEmail: string;
  alreadyQueued: boolean;
};

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`The ${what} was not returned.`);
  }
  return value;
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

// --- Overview and email status ---------------------------------------------

export async function getMerchantSalesOverview(signal?: AbortSignal) {
  const response = await apiRequest<MerchantSalesOverview>(`${base}/overview`, { signal });
  return must(response.data, "overview");
}

/**
 * Email states for a whole page of documents in one request, so a list never
 * issues one call per row.
 */
export async function getMerchantEmailStatuses(
  quotationIds: string[],
  invoiceIds: string[],
  signal?: AbortSignal
) {
  if (quotationIds.length === 0 && invoiceIds.length === 0) return [];

  const response = await apiRequest<MerchantDocumentEmailStatus[]>(
    `${base}/email-status${query({
      quotationIds: quotationIds.join(","),
      invoiceIds: invoiceIds.join(","),
    })}`,
    { signal }
  );
  return response.data ?? [];
}

// --- Invoices --------------------------------------------------------------

export type InvoiceListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  merchantId?: string;
  fromDate?: string;
  toDate?: string;
};

export async function listInvoices(
  params: InvoiceListParams,
  signal?: AbortSignal
): Promise<AdminPagedResult<AdminMerchantInvoice>> {
  const response = await apiRequest<AdminMerchantInvoice[]>(
    `${base}/invoices${query({ ...params })}`,
    { signal }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function getInvoice(id: string) {
  const response = await apiRequest<AdminMerchantInvoice>(`${base}/invoices/${id}`);
  return must(response.data, "invoice");
}

export async function issueInvoice(merchantOrderId: string, internalNotes?: string | null) {
  const response = await apiRequest<AdminMerchantInvoice>(
    `${base}/orders/${merchantOrderId}/invoice`,
    { method: "POST", body: { internalNotes: internalNotes ?? null } }
  );
  return must(response.data, "invoice");
}

export async function cancelInvoice(id: string, concurrencyToken: string) {
  const response = await apiRequest<AdminMerchantInvoice>(`${base}/invoices/${id}/cancel`, {
    method: "POST",
    body: { concurrencyToken },
  });
  return must(response.data, "invoice");
}

export type RecordPaymentInput = {
  paymentDate: string;
  amountReceived: number;
  method: string;
  transactionReference: string | null;
  internalNote: string | null;
  paymentProofMediaFileId: string | null;
  concurrencyToken: string;
};

export async function recordPayment(invoiceId: string, input: RecordPaymentInput) {
  const response = await apiRequest<RecordPaymentResult>(
    `${base}/invoices/${invoiceId}/payments`,
    { method: "POST", body: input }
  );
  return must(response.data, "payment result");
}

// --- Commissions -----------------------------------------------------------

export async function listCommissions(
  params: { page: number; pageSize: number; salespersonId?: string; status?: string },
  signal?: AbortSignal
): Promise<AdminPagedResult<AdminSalesCommission>> {
  const response = await apiRequest<AdminSalesCommission[]>(
    `${base}/commissions${query({ ...params })}`,
    { signal }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function markCommissionPaid(id: string, concurrencyToken: string) {
  const response = await apiRequest<AdminSalesCommission>(
    `${base}/commissions/${id}/mark-paid`,
    { method: "POST", body: { concurrencyToken } }
  );
  return must(response.data, "commission");
}

// --- Emails ----------------------------------------------------------------

export async function sendQuotationEmail(quotationId: string) {
  const response = await apiRequest<MerchantEmailQueueResult>(
    `${base}/quotations/${quotationId}/send-email`,
    { method: "POST" }
  );
  return must(response.data, "email result");
}

export async function sendInvoiceEmail(invoiceId: string) {
  const response = await apiRequest<MerchantEmailQueueResult>(
    `${base}/invoices/${invoiceId}/send-email`,
    { method: "POST" }
  );
  return must(response.data, "email result");
}

// --- Documents -------------------------------------------------------------

export type MerchantDocumentKind =
  | "quotation"
  | "invoice"
  | "receipt"
  | "deliveryOrder";

function documentPath(kind: MerchantDocumentKind, id: string) {
  switch (kind) {
    case "quotation":
      return `${base}/quotations/${id}/quotation.pdf`;
    case "invoice":
      return `${base}/invoices/${id}/invoice.pdf`;
    case "deliveryOrder":
      return `${base}/delivery-orders/${id}/delivery-order.pdf`;
    default:
      // The receipt is addressed by its invoice, which is what the Admin has
      // in hand at every point it can be downloaded.
      return `${base}/invoices/${id}/receipt.pdf`;
  }
}

/**
 * Downloads a document through the authorized endpoint and hands the browser a
 * file with the server's own filename.
 *
 * The response is checked before a Blob URL is ever created, so a failure can
 * never open a window onto an error page, and the temporary URL is always
 * revoked.
 */
export async function downloadMerchantDocument(
  kind: MerchantDocumentKind,
  id: string
): Promise<{ fileName: string }> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error("MyPetLink connection is not configured.");
  }

  const session = readStoredAuthSession();
  const response = await fetch(`${baseUrl}${documentPath(kind, id)}`, {
    headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
  });

  if (!response.ok) {
    throw await documentError(response);
  }

  const type = response.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/pdf")) {
    throw new Error("That document could not be prepared. Please try again.");
  }

  const blob = await response.blob();
  const fileName = fileNameFrom(response.headers.get("content-disposition"), kind);

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Revoked on the next tick so the click has taken the URL first.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return { fileName };
}

async function documentError(response: Response): Promise<Error> {
  let code = "";
  let message = "";
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    code = body.error?.code ?? "";
    message = body.error?.message ?? "";
  } catch {
    // A non-JSON body tells us nothing; the status still does.
  }

  if (response.status === 401) {
    return new Error("Your session has expired. Please sign in again.");
  }
  if (response.status === 403) {
    return new Error("You do not have permission to download this document.");
  }
  if (response.status === 404) {
    return new Error("That document is not available. The record may have been removed.");
  }
  if (response.status === 409) {
    // The server explains precisely what is missing or not yet issued.
    return new Error(message || "That document cannot be produced yet.");
  }

  return new Error(
    code === "business_identity_incomplete" && message
      ? message
      : "We couldn’t prepare that document. Please try again."
  );
}

/** Uses the server's filename; falls back to a safe local name. */
function fileNameFrom(disposition: string | null, kind: MerchantDocumentKind): string {
  const fallback = `MyPetLink-${kind === "deliveryOrder" ? "delivery-order" : kind}.pdf`;
  if (!disposition) return fallback;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  const raw = encoded?.[1] ? decodeURIComponent(encoded[1]) : plain?.[1];
  if (!raw) return fallback;

  // Never let a header steer a path or a second header line.
  const safe = raw.replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  if (!safe || safe.includes("\r") || safe.includes("\n") || !safe.endsWith(".pdf")) {
    return fallback;
  }
  return safe;
}

export function getDocumentErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (isApiClientError(error)) return error.message;
  return fallback;
}
