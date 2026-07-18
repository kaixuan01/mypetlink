import { buildAdminListQuery, csvCell, triggerDownload } from "@/lib/adminListShared";
import { fulfilmentStatusLabels, paymentStatusLabels, type AdminOrderFulfilmentStatus, type AdminOrderPaymentStatus } from "@/services/adminOrderService";
import { canUseAdminApi } from "@/services/adminService";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import { mockDelay } from "@/services/mockApi";
import { getPets } from "@/services/petService";
import { adminConfirmOrderPayment, adminRejectOrderPayment, getStoredOrdersForAdmin } from "@/services/tagService";
import type { OrderStatus, TagOrder } from "@/types";

export type AdminPaymentProofStatus = "PendingReview" | "Approved" | "Rejected" | "Superseded";

export type AdminPaymentProofListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  orderPaymentStatus?: string;
  hasReference?: string;
  hasMedia?: string;
  needsAttention?: string;
  overdue?: string;
  paymentMethod?: string;
  owner?: string;
  ownerId?: string;
  reviewer?: string;
  amountMin?: string;
  amountMax?: string;
  submittedFrom?: string;
  submittedTo?: string;
  reviewedFrom?: string;
  reviewedTo?: string;
  sortBy?: string;
  sortDir?: string;
};

export type AdminPaymentProof = {
  id: string;
  orderId: string;
  orderNumber: string;
  ownerId?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  petName?: string;
  tagCode?: string;
  expectedAmount: number;
  currency: string;
  status: AdminPaymentProofStatus;
  orderStatus: Exclude<OrderStatus, "Draft">;
  orderPaymentStatus: AdminOrderPaymentStatus;
  fulfilmentStatus: AdminOrderFulfilmentStatus;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  hasMedia: boolean;
  paymentMethod: string;
  paymentReference?: string;
  ownerNote?: string;
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewerName?: string;
  reviewerEmail?: string;
  updatedAt: string;
  referenceUsedByOtherOrder: boolean;
  proofFileUsedByOtherOrder: boolean;
  orderStateConflict: boolean;
  pendingProofCount: number;
  requiresAttention: boolean;
};

export type AdminPaymentProofCounts = {
  all: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  superseded: number;
  needsAttention: number;
};

type BackendPaymentProofItem = Omit<AdminPaymentProof, "ownerId" | "orderStatus"> & {
  ownerUserId: string;
  orderStatus: "PendingPayment" | "PaymentProofSubmitted" | "PaymentConfirmed" | "PreparingTag" | "Shipped" | "Delivered" | "Cancelled";
};

const backendOrderStatus: Record<BackendPaymentProofItem["orderStatus"], AdminPaymentProof["orderStatus"]> = {
  PendingPayment: "Pending Payment",
  PaymentProofSubmitted: "Payment Submitted",
  PaymentConfirmed: "Payment Confirmed",
  PreparingTag: "Preparing",
  Shipped: "Shipped",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
};

export const paymentProofStatusLabels: Record<AdminPaymentProofStatus, string> = {
  PendingReview: "Pending review",
  Approved: "Approved",
  Rejected: "Rejected",
  Superseded: "Superseded",
};

function mapBackend(item: BackendPaymentProofItem): AdminPaymentProof {
  return {
    ...item,
    ownerId: item.ownerUserId,
    orderStatus: backendOrderStatus[item.orderStatus],
    paymentReference: item.paymentReference ?? undefined,
    ownerNote: item.ownerNote ?? undefined,
    rejectionReason: item.rejectionReason ?? undefined,
    reviewedAt: item.reviewedAt ?? undefined,
    reviewerName: item.reviewerName ?? undefined,
    reviewerEmail: item.reviewerEmail ?? undefined,
    tagCode: item.tagCode ?? undefined,
    petName: item.petName ?? undefined,
  };
}

function buildQuery(params: AdminPaymentProofListParams, omitPaging = false) {
  return buildAdminListQuery(params, { dateOnlyToKeys: ["submittedTo", "reviewedTo"], omitPaging });
}

export async function listAdminPaymentProofs(params: AdminPaymentProofListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendPaymentProofItem[]>(`/api/v1/admin/payment-proofs/table?${buildQuery(params)}`, { signal });
    return { items: (response.data ?? []).map(mapBackend), total: response.meta?.total ?? 0 };
  }

  await mockDelay();
  const rows = sortLocal(filterLocal(await loadLocalProofs(), params), params);
  const start = (params.page - 1) * params.pageSize;
  return { items: rows.slice(start, start + params.pageSize), total: rows.length };
}

export async function countAdminPaymentProofs(params: AdminPaymentProofListParams, signal?: AbortSignal): Promise<AdminPaymentProofCounts> {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminPaymentProofCounts>(`/api/v1/admin/payment-proofs/counts?${buildQuery(params, true)}`, { signal });
    return response.data ?? emptyCounts();
  }

  await mockDelay();
  return countsFor(filterLocal(await loadLocalProofs(), { ...params, status: undefined }));
}

export async function getAdminPaymentProofDetail(proofId: string, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendPaymentProofItem>(`/api/v1/admin/payment-proofs/${encodeURIComponent(proofId)}/detail`, { signal });
    if (!response.data) throw new Error("This payment proof could not be found.");
    return mapBackend(response.data);
  }

  await mockDelay();
  const proof = (await loadLocalProofs()).find((item) => item.id === proofId);
  if (!proof) throw new Error("This payment proof could not be found.");
  return proof;
}

export async function approveAdminPaymentProof(proof: AdminPaymentProof) {
  if (canUseAdminApi()) {
    const response = await apiRequest<unknown>(`/api/v1/admin/payment-proofs/${encodeURIComponent(proof.id)}/approve`, { method: "POST" });
    if (!response.data) throw new Error("This payment proof is no longer waiting for review.");
    return;
  }
  const result = await adminConfirmOrderPayment(proof.orderId);
  if (!result.data) throw new Error("This payment proof is no longer waiting for review.");
}

export async function rejectAdminPaymentProof(proof: AdminPaymentProof, reason: string) {
  if (!reason.trim()) throw new Error("Enter a reason before rejecting this payment proof.");
  if (canUseAdminApi()) {
    const response = await apiRequest<unknown>(`/api/v1/admin/payment-proofs/${encodeURIComponent(proof.id)}/reject`, {
      method: "POST",
      body: { reason: reason.trim() },
    });
    if (!response.data) throw new Error("This payment proof is no longer waiting for review.");
    return;
  }
  const result = await adminRejectOrderPayment(proof.orderId, reason.trim());
  if (!result.data) throw new Error("This payment proof is no longer waiting for review.");
}

export function getAdminPaymentProofExportFormats(): ("csv" | "xlsx")[] {
  return canUseAdminApi() ? ["csv", "xlsx"] : ["csv"];
}

export async function downloadAdminPaymentProofsExport(params: AdminPaymentProofListParams, format: "csv" | "xlsx", selectedIds?: string[]) {
  if (canUseAdminApi()) {
    const query = new URLSearchParams(buildQuery(params, true));
    query.set("format", format);
    if (selectedIds?.length) query.set("ids", selectedIds.join(","));
    const { blob, fileName } = await apiRequestBlob(`/api/v1/admin/payment-proofs/export?${query}`);
    triggerDownload(blob, fileName ?? `mypetlink-payment-proofs.${format}`);
    return;
  }

  await mockDelay();
  let rows = sortLocal(filterLocal(await loadLocalProofs(), params), params);
  if (selectedIds?.length) {
    const selected = new Set(selectedIds);
    rows = rows.filter((row) => selected.has(row.id));
  }
  const data = [
    ["Order Number", "Customer Name", "Customer Email", "Expected Amount", "Payment Reference", "Payment Method", "Review Status", "Submitted At", "Reviewer", "Reviewed At", "Rejection Reason", "Order Payment Status"],
    ...rows.map((row) => [row.orderNumber, row.ownerName, row.ownerEmail, `${row.currency} ${row.expectedAmount.toFixed(2)}`, row.paymentReference ?? "", row.paymentMethod, paymentProofStatusLabels[row.status], row.submittedAt, row.reviewerName ?? "", row.reviewedAt ?? "", row.rejectionReason ?? "", paymentStatusLabels[row.orderPaymentStatus]]),
  ];
  const csv = data.map((row) => row.map(csvCell).join(",")).join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mypetlink-payment-proofs.csv");
}

async function loadLocalProofs(): Promise<AdminPaymentProof[]> {
  const [orders, pets] = await Promise.all([getStoredOrdersForAdmin(), getPets()]);
  const petMap = new Map(pets.data.map((pet) => [pet.id, pet]));
  return orders.data.flatMap((order) => {
    const pet = petMap.get(order.petId);
    return (order.paymentProofs ?? []).map((proof, index) => ({
      id: proof.id,
      orderId: order.id,
      orderNumber: order.orderNumber ?? order.id,
      ownerName: pet?.owner.name ?? "Owner",
      ownerEmail: "",
      ownerPhone: order.delivery.phone,
      petName: pet?.name ?? order.petName,
      tagCode: undefined,
      expectedAmount: parseAmount(order.estimatedPrice),
      currency: "MYR",
      status: proof.status,
      orderStatus: order.status === "Draft" ? "Pending Payment" : order.status,
      orderPaymentStatus: localPaymentStatus(order),
      fulfilmentStatus: localFulfilment(order.status),
      originalFileName: proof.originalFileName,
      contentType: proof.originalFileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      fileSize: 0,
      hasMedia: false,
      paymentMethod: proof.paymentMethod,
      paymentReference: proof.paymentReference,
      ownerNote: proof.ownerNote,
      rejectionReason: proof.rejectionReason,
      submittedAt: order.paymentSubmittedDate ?? order.orderedDate,
      reviewedAt: undefined,
      reviewerName: proof.reviewedLabel ? "Admin" : undefined,
      reviewerEmail: undefined,
      updatedAt: order.paymentSubmittedDate ?? order.orderedDate,
      referenceUsedByOtherOrder: false,
      proofFileUsedByOtherOrder: false,
      orderStateConflict: proof.status === "PendingReview" && order.status !== "Payment Submitted",
      pendingProofCount: (order.paymentProofs ?? []).filter((item) => item.status === "PendingReview").length,
      requiresAttention: proof.status === "PendingReview" && (order.status !== "Payment Submitted" || index > 0),
    } satisfies AdminPaymentProof));
  });
}

function filterLocal(rows: AdminPaymentProof[], params: AdminPaymentProofListParams) {
  const term = params.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (params.status && row.status !== params.status) return false;
    if (params.orderPaymentStatus && row.orderPaymentStatus !== params.orderPaymentStatus) return false;
    if (params.hasReference && (params.hasReference === "true") !== Boolean(row.paymentReference)) return false;
    if (params.hasMedia && (params.hasMedia === "true") !== row.hasMedia) return false;
    if (params.needsAttention && (params.needsAttention === "true") !== row.requiresAttention) return false;
    if (params.overdue && (params.overdue === "true") !== isOverdue(row)) return false;
    if (params.paymentMethod && !row.paymentMethod.toLowerCase().includes(params.paymentMethod.toLowerCase())) return false;
    if (params.owner && !`${row.ownerName} ${row.ownerEmail} ${row.ownerPhone}`.toLowerCase().includes(params.owner.toLowerCase())) return false;
    if (params.reviewer && !`${row.reviewerName ?? ""} ${row.reviewerEmail ?? ""}`.toLowerCase().includes(params.reviewer.toLowerCase())) return false;
    if (params.amountMin && row.expectedAmount < Number(params.amountMin)) return false;
    if (params.amountMax && row.expectedAmount > Number(params.amountMax)) return false;
    if (!dateInRange(row.submittedAt, params.submittedFrom, params.submittedTo)) return false;
    if ((params.reviewedFrom || params.reviewedTo) && !dateInRange(row.reviewedAt, params.reviewedFrom, params.reviewedTo)) return false;
    if (term && !`${row.orderNumber} ${row.ownerName} ${row.ownerEmail} ${row.ownerPhone} ${row.paymentReference ?? ""} ${row.reviewerName ?? ""} ${row.reviewerEmail ?? ""} ${row.tagCode ?? ""}`.toLowerCase().includes(term)) return false;
    return true;
  });
}

function sortLocal(rows: AdminPaymentProof[], params: AdminPaymentProofListParams) {
  const sorted = [...rows];
  if (!params.sortBy) return sorted.sort((a, b) => (a.status === "PendingReview" ? 0 : 1) - (b.status === "PendingReview" ? 0 : 1) || a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id));
  const direction = params.sortDir === "asc" ? 1 : -1;
  const value = (row: AdminPaymentProof) => {
    if (params.sortBy === "submittedAt") return row.submittedAt;
    if (params.sortBy === "reviewedAt") return row.reviewedAt ?? "";
    if (params.sortBy === "orderNumber") return row.orderNumber;
    if (params.sortBy === "customer") return row.ownerName;
    if (params.sortBy === "amount") return row.expectedAmount;
    if (params.sortBy === "status") return row.status;
    if (params.sortBy === "reviewer") return row.reviewerName ?? "";
    return row.updatedAt;
  };
  return sorted.sort((a, b) => String(value(a)).localeCompare(String(value(b)), undefined, { numeric: true }) * direction || a.id.localeCompare(b.id));
}

function countsFor(rows: AdminPaymentProof[]): AdminPaymentProofCounts {
  return {
    all: rows.length,
    pendingReview: rows.filter((row) => row.status === "PendingReview").length,
    approved: rows.filter((row) => row.status === "Approved").length,
    rejected: rows.filter((row) => row.status === "Rejected").length,
    superseded: rows.filter((row) => row.status === "Superseded").length,
    needsAttention: rows.filter((row) => row.requiresAttention).length,
  };
}

function emptyCounts(): AdminPaymentProofCounts {
  return { all: 0, pendingReview: 0, approved: 0, rejected: 0, superseded: 0, needsAttention: 0 };
}

function localPaymentStatus(order: TagOrder): AdminOrderPaymentStatus {
  if (order.status === "Payment Submitted") return "ProofSubmitted";
  if (["Payment Confirmed", "Preparing", "Shipped", "Delivered"].includes(order.status)) return "Confirmed";
  if (order.paymentRejectionReason) return "Rejected";
  return "Pending";
}

function localFulfilment(status: OrderStatus): AdminOrderFulfilmentStatus {
  if (status === "Preparing") return "Preparing";
  if (status === "Shipped") return "Shipped";
  if (status === "Delivered") return "Delivered";
  if (status === "Cancelled") return "Cancelled";
  return "NotStarted";
}

function parseAmount(value: string) {
  const number = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function isOverdue(row: AdminPaymentProof) {
  const date = Date.parse(row.submittedAt);
  return row.status === "PendingReview" && Number.isFinite(date) && date <= Date.now() - 24 * 60 * 60 * 1000;
}

function dateInRange(value?: string, from?: string, to?: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  if (from && time < Date.parse(from)) return false;
  if (to && time > Date.parse(`${to}T23:59:59Z`)) return false;
  return true;
}


export { fulfilmentStatusLabels, paymentStatusLabels };
