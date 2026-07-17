import { getAdminOrderActions, type AdminOrderAction } from "@/lib/orders";
import { canUseAdminApi } from "@/services/adminService";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import type { BackendMediaDownloadUrlResponse, BackendPaymentProof, BackendTagOrder } from "@/services/apiDtos";
import { mockDelay } from "@/services/mockApi";
import { getPets } from "@/services/petService";
import { getStoredOrdersForAdmin, mapBackendOrder } from "@/services/tagService";
import type { OrderStatus, TagOrder, TagVariant } from "@/types";

export type AdminOrderPaymentStatus =
  | "Pending"
  | "ProofSubmitted"
  | "Confirmed"
  | "Rejected"
  | "Refunded";
export type AdminOrderFulfilmentStatus =
  | "NotStarted"
  | "Preparing"
  | "Shipped"
  | "Delivered"
  | "Cancelled";
export type AdminOrderStage =
  | "awaiting-payment"
  | "payment-review"
  | "ready-to-prepare"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type AdminOrderListParams = {
  page: number;
  pageSize: number;
  search?: string;
  stage?: string;
  paymentStatus?: string;
  fulfilmentStatus?: string;
  hasProof?: string;
  paymentMethod?: string;
  tagType?: string;
  variant?: string;
  hasAssignedTag?: string;
  hasTracking?: string;
  ownerId?: string;
  petId?: string;
  owner?: string;
  pet?: string;
  orderNumber?: string;
  deliveryLocation?: string;
  amountMin?: string;
  amountMax?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  proofSubmittedFrom?: string;
  proofSubmittedTo?: string;
  paymentConfirmedFrom?: string;
  paymentConfirmedTo?: string;
  shippedFrom?: string;
  shippedTo?: string;
  deliveredFrom?: string;
  deliveredTo?: string;
  sortBy?: string;
  sortDir?: string;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  ownerId?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  petId: string;
  petName: string;
  hasNfc: boolean;
  variant: TagVariant;
  amount: number;
  currency: string;
  deliveryFee: number;
  orderStatus: Exclude<OrderStatus, "Draft">;
  paymentStatus: AdminOrderPaymentStatus;
  fulfilmentStatus: AdminOrderFulfilmentStatus;
  hasPaymentProof: boolean;
  latestPaymentProofStatus?: "PendingReview" | "Approved" | "Rejected" | "Superseded";
  paymentProofSubmittedAt?: string;
  paymentMethod?: string;
  paymentReference?: string;
  assignedTagId?: string;
  assignedTagCode?: string;
  deliveryCity: string;
  deliveryState: string;
  trackingNumber?: string;
  paymentConfirmedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminOrderCounts = {
  all: number;
  awaitingPayment: number;
  paymentReview: number;
  readyToPrepare: number;
  preparing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
};

export type AdminOrderDetail = {
  order: TagOrder;
  backendOrder?: BackendTagOrder;
  owner: { id?: string; name: string; email: string };
};

type BackendAdminOrderItem = {
  id: string;
  orderNumber: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  petId: string;
  petName: string;
  tagType: "QrPetTag" | "QrNfcSmartTag";
  variant: string;
  amount: number;
  currency: string;
  deliveryFee: number;
  orderStatus: BackendTagOrder["status"];
  paymentStatus: AdminOrderPaymentStatus;
  fulfilmentStatus: AdminOrderFulfilmentStatus;
  hasPaymentProof: boolean;
  latestPaymentProofStatus?: AdminOrder["latestPaymentProofStatus"] | null;
  paymentProofSubmittedAt?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  assignedTagId?: string | null;
  assignedTagCode?: string | null;
  deliveryCity: string;
  deliveryState: string;
  trackingNumber?: string | null;
  paymentConfirmedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackendAdminOrderDetail = {
  order: BackendTagOrder;
  owner: { userId: string; displayName: string; email: string };
};

const backendStatusToFrontend: Record<BackendTagOrder["status"], AdminOrder["orderStatus"]> = {
  PendingPayment: "Pending Payment",
  PaymentProofSubmitted: "Payment Submitted",
  PaymentConfirmed: "Payment Confirmed",
  PreparingTag: "Preparing",
  Shipped: "Shipped",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
};

export const paymentStatusLabels: Record<AdminOrderPaymentStatus, string> = {
  Pending: "Pending",
  ProofSubmitted: "Proof submitted",
  Confirmed: "Confirmed",
  Rejected: "Rejected",
  Refunded: "Refunded",
};

export const fulfilmentStatusLabels: Record<AdminOrderFulfilmentStatus, string> = {
  NotStarted: "Not started",
  Preparing: "Preparing",
  Shipped: "Shipped",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
};

function mapBackendItem(item: BackendAdminOrderItem): AdminOrder {
  return {
    id: item.id,
    orderNumber: item.orderNumber,
    ownerId: item.ownerUserId,
    ownerName: item.ownerName || item.ownerEmail,
    ownerEmail: item.ownerEmail,
    ownerPhone: item.ownerPhone,
    petId: item.petId,
    petName: item.petName,
    hasNfc: item.tagType === "QrNfcSmartTag",
    variant: item.variant?.toLowerCase() === "lightweight" ? "Lightweight" : "Standard",
    amount: item.amount,
    currency: item.currency,
    deliveryFee: item.deliveryFee,
    orderStatus: backendStatusToFrontend[item.orderStatus],
    paymentStatus: item.paymentStatus,
    fulfilmentStatus: item.fulfilmentStatus,
    hasPaymentProof: item.hasPaymentProof,
    latestPaymentProofStatus: item.latestPaymentProofStatus ?? undefined,
    paymentProofSubmittedAt: item.paymentProofSubmittedAt ?? undefined,
    paymentMethod: item.paymentMethod ?? undefined,
    paymentReference: item.paymentReference ?? undefined,
    assignedTagId: item.assignedTagId ?? undefined,
    assignedTagCode: item.assignedTagCode ?? undefined,
    deliveryCity: item.deliveryCity,
    deliveryState: item.deliveryState,
    trackingNumber: item.trackingNumber ?? undefined,
    paymentConfirmedAt: item.paymentConfirmedAt ?? undefined,
    shippedAt: item.shippedAt ?? undefined,
    deliveredAt: item.deliveredAt ?? undefined,
    cancelledAt: item.cancelledAt ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function buildQuery(params: AdminOrderListParams, omitPaging = false) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && (!omitPaging || (key !== "page" && key !== "pageSize"))) {
      query.set(key, String(value));
    }
  }

  for (const key of [
    "createdTo",
    "updatedTo",
    "proofSubmittedTo",
    "paymentConfirmedTo",
    "shippedTo",
    "deliveredTo",
  ] as const) {
    const value = query.get(key);
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) query.set(key, `${value}T23:59:59Z`);
  }

  return query.toString();
}

export async function listAdminOrders(params: AdminOrderListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendAdminOrderItem[]>(
      `/api/v1/admin/orders/table?${buildQuery(params)}`,
      { signal }
    );
    return { items: (response.data ?? []).map(mapBackendItem), total: response.meta?.total ?? 0 };
  }

  await mockDelay();
  const rows = sortLocal(filterLocal(await loadLocalOrders(), params), params);
  const start = (params.page - 1) * params.pageSize;
  return { items: rows.slice(start, start + params.pageSize), total: rows.length };
}

export async function countAdminOrders(params: AdminOrderListParams, signal?: AbortSignal): Promise<AdminOrderCounts> {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminOrderCounts>(
      `/api/v1/admin/orders/counts?${buildQuery(params, true)}`,
      { signal }
    );
    return response.data ?? emptyCounts();
  }

  await mockDelay();
  const rows = filterLocal(await loadLocalOrders(), { ...params, stage: undefined });
  return countsFor(rows);
}

export async function getAdminOrderDetail(orderId: string, signal?: AbortSignal): Promise<AdminOrderDetail> {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendAdminOrderDetail>(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}`,
      { signal }
    );
    if (!response.data) throw new Error("This order could not be found.");
    return {
      order: mapBackendOrder(response.data.order),
      backendOrder: response.data.order,
      owner: {
        id: response.data.owner.userId,
        name: response.data.owner.displayName || response.data.owner.email,
        email: response.data.owner.email,
      },
    };
  }

  await mockDelay();
  const [orders, pets] = await Promise.all([getStoredOrdersForAdmin(), getPets()]);
  const order = orders.data.find((item) => item.id === orderId);
  if (!order) throw new Error("This order could not be found.");
  const pet = pets.data.find((item) => item.id === order.petId);
  return { order, owner: { name: pet?.owner.name ?? "Owner", email: "" } };
}

export async function getAdminOrderSummary(orderId: string, signal?: AbortSignal): Promise<AdminOrder> {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendAdminOrderDetail>(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}`,
      { signal }
    );
    if (!response.data) throw new Error("This order could not be found.");
    const { order, owner } = response.data;
    const proof = order.paymentProofs?.[0];
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      ownerId: owner.userId,
      ownerName: owner.displayName || owner.email,
      ownerEmail: owner.email,
      ownerPhone: order.delivery.phoneE164,
      petId: order.petId,
      petName: order.petName ?? "Pet profile",
      hasNfc: order.tagType === "QrNfcSmartTag",
      variant: order.variant?.toLowerCase() === "lightweight" ? "Lightweight" : "Standard",
      amount: order.amount,
      currency: order.currency,
      deliveryFee: order.deliveryFee,
      orderStatus: backendStatusToFrontend[order.status],
      paymentStatus: order.paymentStatus,
      fulfilmentStatus: deriveBackendFulfilment(order.status),
      hasPaymentProof: Boolean(order.paymentProofs?.length),
      latestPaymentProofStatus: proof?.status,
      paymentProofSubmittedAt: proof?.uploadedAt ?? order.paymentSubmittedAt ?? undefined,
      paymentMethod: proof?.paymentMethod ?? order.paymentMethod ?? undefined,
      paymentReference: proof?.paymentReference ?? order.paymentReference ?? undefined,
      assignedTagId: order.smartTagId ?? undefined,
      assignedTagCode: order.smartTagCode ?? undefined,
      deliveryCity: order.delivery.city,
      deliveryState: order.delivery.state,
      trackingNumber: order.trackingNumber ?? undefined,
      paymentConfirmedAt: order.paymentConfirmedAt ?? undefined,
      shippedAt: order.shippedAt ?? undefined,
      deliveredAt: order.deliveredAt ?? undefined,
      cancelledAt: order.cancelledAt ?? undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  await mockDelay();
  const row = (await loadLocalOrders()).find((item) => item.id === orderId || item.orderNumber === orderId);
  if (!row) throw new Error("This order could not be found.");
  return row;
}

export function getAdminOrderAvailableActions(order: AdminOrder): AdminOrderAction[] {
  return getAdminOrderActions({
    status: order.orderStatus,
    tagId: order.assignedTagId,
  });
}

export function getAdminOrderExportFormats(): ("csv" | "xlsx")[] {
  return canUseAdminApi() ? ["csv", "xlsx"] : ["csv"];
}

export async function downloadAdminOrdersExport(
  params: AdminOrderListParams,
  format: "csv" | "xlsx",
  selectedIds?: string[]
) {
  if (canUseAdminApi()) {
    const query = new URLSearchParams(buildQuery(params, true));
    query.set("format", format);
    if (selectedIds?.length) query.set("ids", selectedIds.join(","));
    const { blob, fileName } = await apiRequestBlob(`/api/v1/admin/orders/export?${query}`);
    triggerDownload(blob, fileName ?? `mypetlink-tag-orders.${format}`);
    return;
  }

  await mockDelay();
  let rows = sortLocal(filterLocal(await loadLocalOrders(), params), params);
  if (selectedIds?.length) {
    const selected = new Set(selectedIds);
    rows = rows.filter((row) => selected.has(row.id));
  }
  const data = [
    ["Order Number", "Customer", "Pet", "Item", "Amount", "Payment", "Fulfilment", "Assigned Tag", "Tracking", "Created"],
    ...rows.map((row) => [
      row.orderNumber,
      row.ownerName,
      row.petName,
      row.hasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag",
      `${row.currency} ${(row.amount + row.deliveryFee).toFixed(2)}`,
      paymentStatusLabels[row.paymentStatus],
      fulfilmentStatusLabels[row.fulfilmentStatus],
      row.assignedTagCode ?? "",
      row.trackingNumber ?? "",
      row.createdAt,
    ]),
  ];
  const csv = data.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mypetlink-tag-orders.csv");
}

export async function openAdminPaymentProof(proofId: string) {
  if (!canUseAdminApi()) throw new Error("The payment proof file is not available in local mode.");
  // Keep the click's user activation while the API creates the short-lived URL.
  // Opening only after the await is commonly blocked by browser popup policies.
  const proofWindow = window.open("about:blank", "_blank");
  if (proofWindow) proofWindow.opener = null;

  try {
    const access = await getAdminPaymentProofAccess(proofId);

    if (!proofWindow) {
      throw new Error("Allow pop-ups to open the payment proof, then try again.");
    }

    proofWindow.location.replace(access.downloadUrl);
  } catch (error) {
    proofWindow?.close();
    throw error;
  }
}

export async function getAdminPaymentProofAccess(proofId: string) {
  if (!canUseAdminApi()) throw new Error("The payment proof file is not available in local mode.");
  const response = await apiRequest<BackendMediaDownloadUrlResponse>(
    `/api/v1/admin/payment-proofs/${encodeURIComponent(proofId)}/download`
  );
  if (!response.data?.downloadUrl) throw new Error("The payment proof file is not available.");
  return response.data;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function derivePaymentStatus(order: TagOrder): AdminOrderPaymentStatus {
  if (order.status === "Payment Submitted") return "ProofSubmitted";
  if (["Payment Confirmed", "Preparing", "Shipped", "Delivered"].includes(order.status)) return "Confirmed";
  if (order.paymentRejectionReason) return "Rejected";
  if (order.status === "Cancelled" && order.paymentConfirmedDate) return "Confirmed";
  return "Pending";
}

function deriveFulfilmentStatus(status: OrderStatus): AdminOrderFulfilmentStatus {
  if (status === "Preparing") return "Preparing";
  if (status === "Shipped") return "Shipped";
  if (status === "Delivered") return "Delivered";
  if (status === "Cancelled") return "Cancelled";
  return "NotStarted";
}

function deriveBackendFulfilment(status: BackendTagOrder["status"]): AdminOrderFulfilmentStatus {
  if (status === "PreparingTag") return "Preparing";
  if (status === "Shipped") return "Shipped";
  if (status === "Delivered") return "Delivered";
  if (status === "Cancelled") return "Cancelled";
  return "NotStarted";
}

function stageFor(status: AdminOrder["orderStatus"]): AdminOrderStage {
  if (status === "Pending Payment") return "awaiting-payment";
  if (status === "Payment Submitted") return "payment-review";
  if (status === "Payment Confirmed") return "ready-to-prepare";
  return status.toLowerCase() as AdminOrderStage;
}

async function loadLocalOrders(): Promise<AdminOrder[]> {
  const [orders, pets] = await Promise.all([getStoredOrdersForAdmin(), getPets()]);
  const petMap = new Map(pets.data.map((pet) => [pet.id, pet]));
  return orders.data.map((order) => {
    const pet = petMap.get(order.petId);
    const price = Number(order.estimatedPrice.replace(/[^0-9.]/g, "")) || 0;
    return {
      id: order.id,
      orderNumber: order.orderNumber ?? order.id,
      ownerName: pet?.owner.name ?? "Owner",
      ownerEmail: "",
      ownerPhone: order.delivery.phone,
      petId: order.petId,
      petName: order.petName ?? pet?.name ?? "Pet profile",
      hasNfc: order.tagType.includes("NFC"),
      variant: order.variant,
      amount: price,
      currency: "MYR",
      deliveryFee: 0,
      orderStatus: order.status === "Draft" ? "Pending Payment" : order.status,
      paymentStatus: derivePaymentStatus(order),
      fulfilmentStatus: deriveFulfilmentStatus(order.status),
      hasPaymentProof: Boolean(order.paymentProofName || order.paymentProofs?.length),
      latestPaymentProofStatus: order.paymentProofs?.[0]?.status,
      paymentProofSubmittedAt: order.paymentSubmittedDate,
      paymentMethod: order.paymentMethod,
      paymentReference: order.paymentReference,
      assignedTagId: order.tagId,
      deliveryCity: order.delivery.city,
      deliveryState: order.delivery.state,
      trackingNumber: order.trackingNumber,
      paymentConfirmedAt: order.paymentConfirmedDate,
      shippedAt: order.shippedDate,
      deliveredAt: order.deliveredDate,
      createdAt: order.orderedDate,
      updatedAt: order.deliveredDate ?? order.shippedDate ?? order.paymentConfirmedDate ?? order.orderedDate,
    };
  });
}

function filterLocal(rows: AdminOrder[], params: AdminOrderListParams) {
  const search = params.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (search && ![
      row.orderNumber,
      row.ownerName,
      row.ownerEmail,
      row.ownerPhone,
      row.petName,
      row.assignedTagCode,
      row.trackingNumber,
      row.paymentReference,
    ].some((value) => value?.toLowerCase().includes(search))) return false;
    if (params.stage && stageFor(row.orderStatus) !== params.stage) return false;
    if (params.paymentStatus && row.paymentStatus !== params.paymentStatus) return false;
    if (params.fulfilmentStatus && row.fulfilmentStatus !== params.fulfilmentStatus) return false;
    if (params.hasProof && (params.hasProof === "true") !== row.hasPaymentProof) return false;
    if (params.paymentMethod && !(row.paymentMethod ?? "").toLowerCase().includes(params.paymentMethod.toLowerCase())) return false;
    if (params.tagType && (params.tagType === "QR_NFC") !== row.hasNfc) return false;
    if (params.variant && row.variant !== params.variant) return false;
    if (params.hasAssignedTag && (params.hasAssignedTag === "true") !== Boolean(row.assignedTagId)) return false;
    if (params.hasTracking && (params.hasTracking === "true") !== Boolean(row.trackingNumber)) return false;
    if (params.ownerId && row.ownerId !== params.ownerId) return false;
    if (params.petId && row.petId !== params.petId) return false;
    if (params.owner && ![row.ownerName, row.ownerEmail, row.ownerPhone].some((value) => value.toLowerCase().includes(params.owner!.toLowerCase()))) return false;
    if (params.pet && !row.petName.toLowerCase().includes(params.pet.toLowerCase())) return false;
    if (params.orderNumber && !row.orderNumber.toLowerCase().includes(params.orderNumber.toLowerCase())) return false;
    if (params.deliveryLocation && ![row.deliveryCity, row.deliveryState].some((value) => value.toLowerCase().includes(params.deliveryLocation!.toLowerCase()))) return false;
    const total = row.amount + row.deliveryFee;
    if (params.amountMin && total < Number(params.amountMin)) return false;
    if (params.amountMax && total > Number(params.amountMax)) return false;
    return inRange(row.createdAt, params.createdFrom, params.createdTo)
      && inRange(row.updatedAt, params.updatedFrom, params.updatedTo)
      && inRange(row.paymentProofSubmittedAt, params.proofSubmittedFrom, params.proofSubmittedTo)
      && inRange(row.paymentConfirmedAt, params.paymentConfirmedFrom, params.paymentConfirmedTo)
      && inRange(row.shippedAt, params.shippedFrom, params.shippedTo)
      && inRange(row.deliveredAt, params.deliveredFrom, params.deliveredTo);
  });
}

function inRange(value?: string, from?: string, to?: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return false;
  return (!from || time >= Date.parse(from))
    && (!to || time <= Date.parse(to.length === 10 ? `${to}T23:59:59Z` : to));
}

function sortLocal(rows: AdminOrder[], params: AdminOrderListParams) {
  const field = params.sortBy ?? "createdAt";
  const direction = params.sortDir === "asc" ? 1 : -1;
  const value = (row: AdminOrder): string | number => {
    if (field === "customer") return row.ownerName;
    if (field === "amount") return row.amount + row.deliveryFee;
    if (field === "paymentStatus") return row.paymentStatus;
    if (field === "fulfilmentStatus") return row.fulfilmentStatus;
    if (field === "proofSubmittedAt") return row.paymentProofSubmittedAt ?? "";
    return String((row as unknown as Record<string, unknown>)[field] ?? "");
  };
  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return comparison * direction || left.id.localeCompare(right.id);
  });
}

function countsFor(rows: AdminOrder[]): AdminOrderCounts {
  return {
    all: rows.length,
    awaitingPayment: rows.filter((row) => stageFor(row.orderStatus) === "awaiting-payment").length,
    paymentReview: rows.filter((row) => stageFor(row.orderStatus) === "payment-review").length,
    readyToPrepare: rows.filter((row) => stageFor(row.orderStatus) === "ready-to-prepare").length,
    preparing: rows.filter((row) => stageFor(row.orderStatus) === "preparing").length,
    shipped: rows.filter((row) => stageFor(row.orderStatus) === "shipped").length,
    delivered: rows.filter((row) => stageFor(row.orderStatus) === "delivered").length,
    cancelled: rows.filter((row) => stageFor(row.orderStatus) === "cancelled").length,
  };
}

function emptyCounts(): AdminOrderCounts {
  return { all: 0, awaitingPayment: 0, paymentReview: 0, readyToPrepare: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0 };
}

export function latestProof(order: AdminOrderDetail): BackendPaymentProof | undefined {
  return order.backendOrder?.paymentProofs?.[0];
}
