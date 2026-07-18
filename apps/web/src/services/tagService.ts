import { mockOrders } from "@/data/mockOrders";
import { mockTags } from "@/data/mockTags";
import { formatOrderNumber } from "@/lib/orders";
import {
  isActivePet,
  isArchivedPet,
  isMemorialPet,
} from "@/lib/petLifecycle";
import {
  canActivateTagFromOwnerPortal,
  inactiveTagStatuses,
  isActivePhysicalTag,
  isInactivePhysicalTag,
  isPendingPhysicalTag,
} from "@/lib/tagStatus";
import { generateTagCode, resolveTagCodeAlias } from "@/lib/tagCodes";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import { apiRequest, isApiClientError } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { readStoredAuthSession } from "@/services/authStorage";
import {
  getFriendlyApiErrorMessage,
  getPets,
  mapBackendSafetyPage,
  toPublicProfile,
  toQrSafetyProfile,
} from "@/services/petService";
import type {
  BackendCreateTagOrderResult,
  BackendOrderTimelineEvent,
  BackendPaymentProof,
  BackendSmartTag,
  BackendTagOrder,
  BackendTagScanPage,
} from "@/services/apiDtos";
import type {
  ApiResponse,
  FinderResult,
  OrderPaymentProof,
  OrderStatus,
  OrderTimelineEvent,
  OrderTimelineTone,
  PetTag,
  TagOrder,
  TagOrderPayload,
  TagVariant,
  TagStatus,
  TagType,
} from "@/types";

const TAG_STORAGE_KEY = "mypetlink_tags";
const ORDER_STORAGE_KEY = "mypetlink_orders";

type BackendListEnvelope<T> = {
  data?: T;
  meta?: {
    requestId?: string;
    page?: number | null;
    pageSize?: number | null;
    total?: number | null;
  };
};

function canUseOwnerTagApi() {
  return canUseApi() && Boolean(readStoredAuthSession()?.accessToken);
}

function apiResponse<T>(
  envelope: BackendListEnvelope<T>,
  fallbackData: T
): ApiResponse<T> {
  return {
    data: envelope.data ?? fallbackData,
    meta: {
      requestId: envelope.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
      page: envelope.meta?.page ?? undefined,
      pageSize: envelope.meta?.pageSize ?? undefined,
      total: envelope.meta?.total ?? undefined,
    },
  };
}

function apiNullResponse<T>(): ApiResponse<T | null> {
  return {
    data: null,
    meta: {
      requestId: `api_${Date.now()}`,
      source: "api",
    },
  };
}

export function getFriendlyTagErrorMessage(error: unknown) {
  return getFriendlyApiErrorMessage(error);
}

export function mapBackendTag(tag: BackendSmartTag): PetTag {
  return normalizeTag({
    id: tag.id,
    tagCode: tag.tagCode,
    petId: tag.petId ?? undefined,
    ownerUserId: tag.ownerUserId ?? undefined,
    hasNfc: tag.hasNfc,
    variant: toTagVariant(tag.variant),
    status: fromBackendTagStatus(tag.status),
    batchNo: tag.batchNo ?? undefined,
    orderedDate: formatDisplayDate(tag.createdAt),
    deliveredDate: formatDisplayDate(tag.deliveredAt),
    lastScannedAt: formatDisplayDateTime(tag.lastScannedAt),
    activatedAt: formatDisplayDate(tag.activatedAt),
    replacementForTagId: tag.replacementForTagId ?? undefined,
    isArchived: Boolean(tag.archivedAt || tag.status === "Archived"),
  });
}

export function mapBackendOrder(order: BackendTagOrder): TagOrder {
  const latestProof = order.paymentProofs?.[0];

  return normalizeOrder({
    id: order.id,
    orderNumber: order.orderNumber,
    petId: order.petId,
    petName: order.petName ?? undefined,
    tagType: fromBackendTagType(order.tagType),
    variant: toTagVariant(order.variant),
    delivery: {
      recipientName: order.delivery.recipientName,
      phone: order.delivery.phoneE164,
      addressLine1: order.delivery.addressLine1,
      addressLine2: order.delivery.addressLine2 ?? "",
      postcode: order.delivery.postcode,
      city: order.delivery.city,
      state: order.delivery.state,
      notes: order.delivery.notes ?? "",
    },
    estimatedPrice: formatAmount(order.amount, order.currency),
    status: fromBackendOrderStatus(order.status),
    orderedDate: formatDisplayDate(order.createdAt) ?? formatToday(),
    tagId: order.smartTagId ?? undefined,
    replacementForTagId: order.replacementForTagId ?? undefined,
    paymentMethod: order.paymentMethod ?? latestProof?.paymentMethod ?? "QR Payment",
    paymentReference:
      order.paymentReference ?? latestProof?.paymentReference ?? undefined,
    paymentNote: order.paymentNote ?? latestProof?.ownerNote ?? undefined,
    paymentProofName:
      order.paymentProofName ?? latestProof?.originalFileName ?? undefined,
    paymentSubmittedDate: formatDisplayDate(
      order.paymentSubmittedAt ?? latestProof?.uploadedAt
    ),
    paymentConfirmedDate: formatDisplayDate(order.paymentConfirmedAt),
    paymentRejectionReason:
      order.paymentRejectionReason ?? latestProof?.rejectionReason ?? undefined,
    trackingStatus: order.trackingStatus ?? undefined,
    trackingNumber: order.trackingNumber ?? undefined,
    shippedDate: formatDisplayDate(order.shippedAt),
    deliveredDate: formatDisplayDate(order.deliveredAt),
    timeline: (order.timeline ?? []).map(mapBackendTimelineEvent),
    paymentProofs: (order.paymentProofs ?? []).map(mapBackendPaymentProof),
  });
}

function mapBackendTimelineEvent(
  event: BackendOrderTimelineEvent
): OrderTimelineEvent {
  return {
    type: event.type,
    title: event.title,
    description: event.description ?? undefined,
    timestampLabel: formatTimestampLabel(event.occurredAt),
    tone: toTimelineTone(event.statusTone),
  };
}

function mapBackendPaymentProof(proof: BackendPaymentProof): OrderPaymentProof {
  return {
    id: proof.id,
    status: proof.status,
    originalFileName: proof.originalFileName,
    paymentMethod: proof.paymentMethod,
    paymentReference: proof.paymentReference ?? undefined,
    ownerNote: proof.ownerNote ?? undefined,
    rejectionReason: proof.rejectionReason ?? undefined,
    submittedLabel: formatTimestampLabel(proof.uploadedAt),
    reviewedLabel: formatTimestampLabel(proof.reviewedAt),
  };
}

function toTimelineTone(tone: string): OrderTimelineTone {
  const supported: OrderTimelineTone[] = [
    "completed",
    "current",
    "warning",
    "cancelled",
  ];

  return supported.includes(tone as OrderTimelineTone)
    ? (tone as OrderTimelineTone)
    : "completed";
}

function fromBackendTagType(tagType: string): TagType {
  return tagType === "QrNfcSmartTag"
    ? "MyPetLink QR + NFC Smart Tag"
    : "MyPetLink QR Pet Tag";
}

function toBackendTagType(tagType: TagType) {
  return tagType === "MyPetLink QR + NFC Smart Tag"
    ? "QrNfcSmartTag"
    : "QrPetTag";
}

function fromBackendOrderStatus(status: string): OrderStatus {
  switch (status) {
    case "PendingPayment":
      return "Pending Payment";
    case "PaymentProofSubmitted":
      return "Payment Submitted";
    case "PaymentConfirmed":
      return "Payment Confirmed";
    case "PreparingTag":
      return "Preparing";
    case "Shipped":
    case "Delivered":
    case "Cancelled":
      return status;
    default:
      return "Pending Payment";
  }
}

function fromBackendTagStatus(status: string): TagStatus {
  return status === "Unclaimed" ? "Unassigned" : toTagStatus(status);
}

function toTagStatus(value: string): TagStatus {
  const supported: TagStatus[] = [
    "Unassigned",
    "Pending",
    "Preparing",
    "Delivered",
    "Active",
    "Disabled",
    "Lost",
    "Replaced",
    "Archived",
  ];

  return supported.includes(value as TagStatus)
    ? (value as TagStatus)
    : "Disabled";
}

// Maps backend variant text to the two supported variants. Legacy shape values
// (Round/Bone/etc.) and anything unknown fall back to Standard so old local
// records keep rendering.
function toTagVariant(value: string): TagVariant {
  return value?.trim().toLowerCase() === "lightweight" ? "Lightweight" : "Standard";
}

function formatAmount(amount: number, currency: string) {
  const prefix = currency === "MYR" ? "RM" : `${currency} `;
  return `${prefix}${amount.toFixed(2)}`;
}

function formatDisplayDate(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

// Timeline/proof timestamps: date + time in the viewer's local timezone,
// e.g. "04 Jul 2026, 8:25 PM". Kept separate from formatDisplayDateTime so we
// get a day-first date with a 12-hour clock without touching existing labels.
function formatTimestampLabel(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${datePart}, ${timePart}`;
}

function formatDisplayDateTime(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeTag(tag: PetTag): PetTag {
  return {
    ...tag,
    isArchived: tag.isArchived ?? false,
  };
}

function getTagCollection() {
  return readStoredCollection(TAG_STORAGE_KEY, mockTags).map(normalizeTag);
}

function getOrderCollection() {
  return readStoredCollection(ORDER_STORAGE_KEY, mockOrders).map(normalizeOrder);
}

function normalizeOrder(order: TagOrder): TagOrder {
  const legacyStatus = order.status as string;
  const status: OrderStatus =
    legacyStatus === "Paid"
      ? "Payment Confirmed"
      : legacyStatus === "Received"
        ? "Pending Payment"
        : order.status;

  return {
    ...order,
    orderNumber: order.orderNumber ?? formatOrderNumber(order),
    paymentMethod: order.paymentMethod ?? "QR Payment",
    status,
  };
}

function formatToday() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

export function getEstimatedTagPrice(tagType: TagType) {
  return tagType === "MyPetLink QR + NFC Smart Tag" ? "RM39.90" : "RM19.90";
}

export async function getPetTags(petId: string) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendSmartTag[]>(
      `/api/v1/pets/${encodeURIComponent(petId)}/tags?page=1&pageSize=100`
    );
    const tags = (response.data ?? []).map(mapBackendTag);

    return apiResponse({ data: tags, meta: response.meta }, []);
  }

  await mockDelay();
  const tags = getTagCollection().filter((tag) => tag.petId === petId);

  return mockResponse(tags, {
    page: 1,
    pageSize: tags.length,
    total: tags.length,
  });
}

export async function isPetInLostMode(petId: string) {
  await mockDelay();
  const pets = await getPets();
  return Boolean(pets.data.find((pet) => pet.id === petId)?.lostModeEnabled);
}

export async function getAllTags() {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendSmartTag[]>(
      "/api/v1/tags?page=1&pageSize=100"
    );
    const tags = (response.data ?? []).map(mapBackendTag);

    return apiResponse({ data: tags, meta: response.meta }, []);
  }

  await mockDelay();
  const tags = getTagCollection();

  return mockResponse(tags, {
    page: 1,
    pageSize: tags.length,
    total: tags.length,
  });
}

export async function getStoredTagsForAdmin() {
  await mockDelay();
  const tags = getTagCollection();

  return mockResponse(tags, {
    page: 1,
    pageSize: tags.length,
    total: tags.length,
  });
}

// Local-data helpers for the Admin Tag Inventory listing: read the stored tag
// collection synchronously and persist an updated copy. Used when the app runs
// on local data only.
export function readAdminTagCollection(): PetTag[] {
  return getTagCollection();
}

export function writeAdminTagCollection(tags: PetTag[]) {
  writeStoredCollection(TAG_STORAGE_KEY, tags);
}

export async function getOrders() {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendTagOrder[]>(
      "/api/v1/orders?page=1&pageSize=100"
    );
    const orders = (response.data ?? []).map(mapBackendOrder);

    return apiResponse({ data: orders, meta: response.meta }, []);
  }

  await mockDelay();
  const orders = getOrderCollection();

  return mockResponse(orders, {
    page: 1,
    pageSize: orders.length,
    total: orders.length,
  });
}

export async function getStoredOrdersForAdmin() {
  await mockDelay();
  const orders = getOrderCollection();

  return mockResponse(orders, {
    page: 1,
    pageSize: orders.length,
    total: orders.length,
  });
}

export async function getOrder(orderKey: string) {
  if (canUseOwnerTagApi()) {
    try {
      const response = await apiRequest<BackendTagOrder>(
        `/api/v1/orders/${encodeURIComponent(orderKey)}`
      );

      return apiResponse(
        {
          data: response.data ? mapBackendOrder(response.data) : null,
          meta: response.meta,
        },
        null
      );
    } catch (error) {
      if (isApiClientError(error) && [403, 404].includes(error.status)) {
        return apiNullResponse<TagOrder>();
      }

      throw error;
    }
  }

  await mockDelay();
  const normalized = decodeURIComponent(orderKey).trim().toLowerCase();
  const order =
    getOrderCollection().find(
      (item) =>
        item.id.toLowerCase() === normalized ||
        formatOrderNumber(item).toLowerCase() === normalized
    ) ?? null;

  return mockResponse(order);
}

export async function createTagOrder(payload: TagOrderPayload) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendCreateTagOrderResult>(
      "/api/v1/orders",
      {
        method: "POST",
        body: {
          petId: payload.petId,
          tagType: toBackendTagType(payload.tagType),
          variant: payload.variant,
          delivery: {
            recipientName: payload.delivery.recipientName,
            phoneE164: payload.delivery.phone,
            addressLine1: payload.delivery.addressLine1,
            addressLine2: payload.delivery.addressLine2 || null,
            postcode: payload.delivery.postcode,
            city: payload.delivery.city,
            state: payload.delivery.state,
            notes: payload.delivery.notes || null,
          },
          replacementForTagId: payload.replacementForTagId,
        },
      }
    );
    if (!response.data) {
      throw new Error("Tag order was not created.");
    }

    const mapped = {
      order: mapBackendOrder(response.data.order),
      tag: response.data.tag ? mapBackendTag(response.data.tag) : null,
    };

    return apiResponse({ data: mapped, meta: response.meta }, mapped);
  }

  await mockDelay();
  const orders = getOrderCollection();
  const orderId = `order_${Date.now()}`;
  const orderedDate = formatToday();
  const order: TagOrder = {
    id: orderId,
    orderNumber: formatOrderNumber({ id: orderId }),
    petId: payload.petId,
    tagType: payload.tagType,
    variant: payload.variant,
    delivery: payload.delivery,
    estimatedPrice: getEstimatedTagPrice(payload.tagType),
    status: "Pending Payment",
    orderedDate,
    replacementForTagId: payload.replacementForTagId,
    paymentMethod: "QR Payment",
  };

  writeStoredCollection(ORDER_STORAGE_KEY, [order, ...orders]);

  return mockResponse({ order, tag: null });
}

type SubmitPaymentInput = {
  paymentReference?: string;
  paymentNote?: string;
  paymentProofName?: string;
  mediaFileId?: string;
};

// Phase 1 manual payment: record the owner's receipt / screenshot file name and
// optional bank or eWallet transaction ID, then move the order to
// "Payment Submitted" for manual verification. The order is never marked
// Payment Confirmed automatically.
export async function submitOrderPayment(
  orderId: string,
  proof: SubmitPaymentInput
) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendTagOrder>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/payment-proof`,
      {
        method: "POST",
        body: {
          mediaFileId: proof.mediaFileId,
          fileName: proof.paymentProofName,
          paymentMethod: "QR Payment",
          paymentReference: proof.paymentReference,
          ownerNote: proof.paymentNote,
        },
      }
    );
    const order = response.data ? mapBackendOrder(response.data) : null;

    return apiResponse({ data: { order }, meta: response.meta }, { order });
  }

  await mockDelay();
  const orders = getOrderCollection();
  const existing = orders.find((order) => order.id === orderId);
  const updatedOrder: TagOrder | null = existing
    ? {
        ...existing,
        status: "Payment Submitted",
        paymentReference: proof.paymentReference?.trim() || undefined,
        paymentNote: proof.paymentNote?.trim() || undefined,
        paymentProofName: proof.paymentProofName?.trim() || undefined,
        paymentSubmittedDate: formatToday(),
      }
    : null;

  if (updatedOrder) {
    writeStoredCollection(
      ORDER_STORAGE_KEY,
      orders.map((order) => (order.id === orderId ? updatedOrder : order))
    );
  }

  return mockResponse({ order: updatedOrder });
}

export async function disableTag(tagId: string) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendSmartTag>(
      `/api/v1/tags/${encodeURIComponent(tagId)}/disable`,
      { method: "POST" }
    );

    return apiResponse(
      {
        data: response.data ? mapBackendTag(response.data) : null,
        meta: response.meta,
      },
      null
    );
  }

  await mockDelay();
  return updateTagStatus(tagId, "Disabled");
}

export async function reportTagLost(tagId: string) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendSmartTag>(
      `/api/v1/tags/${encodeURIComponent(tagId)}/mark-lost`,
      { method: "POST" }
    );

    return apiResponse(
      {
        data: response.data ? mapBackendTag(response.data) : null,
        meta: response.meta,
      },
      null
    );
  }

  await mockDelay();
  return updateTagStatus(tagId, "Lost");
}

export async function orderReplacementTag(tagId: string) {
  await mockDelay();
  return updateTagStatus(tagId, "Replaced");
}

export async function archiveTag(tagId: string) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendSmartTag>(
      `/api/v1/tags/${encodeURIComponent(tagId)}/archive`,
      { method: "POST" }
    );

    return apiResponse(
      {
        data: response.data ? mapBackendTag(response.data) : null,
        meta: response.meta,
      },
      null
    );
  }

  await mockDelay();
  return updateTagArchiveState(tagId, true);
}

export async function restoreTag(tagId: string) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendSmartTag>(
      `/api/v1/tags/${encodeURIComponent(tagId)}/restore`,
      { method: "POST" }
    );

    return apiResponse(
      {
        data: response.data ? mapBackendTag(response.data) : null,
        meta: response.meta,
      },
      null
    );
  }

  await mockDelay();
  return updateTagArchiveState(tagId, false);
}

async function updateTagStatus(tagId: string, status: TagStatus) {
  const tags = getTagCollection();
  const tag = tags.find((item) => item.id === tagId);
  const updatedTag = tag ? { ...tag, status } : null;

  if (updatedTag) {
    writeStoredCollection(
      TAG_STORAGE_KEY,
      tags.map((item) => (item.id === tagId ? updatedTag : item))
    );
  }

  return mockResponse(updatedTag);
}

async function updateTagArchiveState(tagId: string, isArchived: boolean) {
  const tags = getTagCollection();
  const tag = tags.find((item) => item.id === tagId);
  const updatedTag = tag ? { ...tag, isArchived } : null;

  if (updatedTag) {
    writeStoredCollection(
      TAG_STORAGE_KEY,
      tags.map((item) => (item.id === tagId ? updatedTag : item))
    );
  }

  return mockResponse(updatedTag);
}

// Resolves a scanned physical tag code to a finder state. Active tags show the
// pet-level Safety Profile content; inactive tags never expose owner contact.
export async function getFinderState(tagCode: string): Promise<FinderResult> {
  if (canUseApi()) {
    const response = await apiRequest<BackendTagScanPage>(
      `/api/v1/public/tags/${encodeURIComponent(tagCode)}`,
      { auth: false, cache: "no-store" }
    );
    const data = response.data;

    if (!data) {
      return { state: "not-found", tagCode };
    }

    const state = data.state.toLowerCase();

    if (state === "active" && data.profile) {
      return {
        state: "active",
        tagCode: data.tagCode,
        profile: mapBackendSafetyPage(data.profile),
      };
    }

    if (state === "unclaimed") {
      return { state: "unassigned", tagCode: data.tagCode };
    }

    if (state === "pending") {
      return {
        state: "pending",
        tagCode: data.tagCode,
        status: fromBackendTagStatus(data.status ?? "Pending"),
      };
    }

    if (state === "inactive") {
      return {
        state: "inactive",
        tagCode: data.tagCode,
        status: fromBackendTagStatus(data.status ?? "Disabled"),
        reason: "inactive",
      };
    }

    return { state: "not-found", tagCode: data.tagCode || tagCode };
  }

  await mockDelay();
  const normalized = tagCode.trim();
  const lookupTagCode = resolveTagCodeAlias(normalized);
  const tag = getTagCollection().find(
    (item) => item.tagCode.toLowerCase() === lookupTagCode.toLowerCase()
  );

  if (!tag) {
    return { state: "not-found", tagCode: normalized };
  }

  if (isInactivePhysicalTag(tag)) {
    return {
      state: "inactive",
      tagCode: tag.tagCode,
      status: tag.status,
      isArchived: tag.isArchived,
      reason: "inactive",
    };
  }

  if (tag.status === "Unassigned" || !tag.petId) {
    return { state: "unassigned", tagCode: tag.tagCode };
  }

  const pets = await getPets();
  const pet = pets.data.find((item) => item.id === tag.petId);

  if (!pet) {
    return {
      state: "inactive",
      tagCode: tag.tagCode,
      status: tag.status,
      isArchived: tag.isArchived,
      reason: "inactive",
    };
  }

  if (!isActivePet(pet)) {
    return {
      state: "inactive",
      tagCode: tag.tagCode,
      status: tag.status,
      isArchived: tag.isArchived,
      reason: isMemorialPet(pet)
        ? "memorial"
        : isArchivedPet(pet)
          ? "archived"
          : "inactive",
      profile: toPublicProfile(pet),
    };
  }

  if (isPendingPhysicalTag(tag)) {
    return {
      state: "pending",
      tagCode: tag.tagCode,
      status: tag.status,
      petId: tag.petId,
    };
  }

  if (!isActivePhysicalTag(tag)) {
    return {
      state: "inactive",
      tagCode: tag.tagCode,
      status: inactiveTagStatuses.includes(tag.status) ? tag.status : "Disabled",
      isArchived: tag.isArchived,
      reason: "inactive",
    };
  }

  return {
    state: "active",
    tagCode: tag.tagCode,
    profile: toQrSafetyProfile(pet),
  };
}

// Binds an unassigned tag to a pet and marks it Active. The tag code never
// changes during activation — only the pet binding and status do.
export async function activateTag(tagCode: string, petId?: string) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<BackendSmartTag>(
      `/api/v1/tags/${encodeURIComponent(tagCode)}/activate`,
      {
        method: "POST",
        body: petId ? { petId } : {},
      }
    );

    return apiResponse(
      {
        data: response.data ? mapBackendTag(response.data) : null,
        meta: response.meta,
      },
      null
    );
  }

  await mockDelay();
  const tags = getTagCollection();
  const lookupTagCode = resolveTagCodeAlias(tagCode);
  const tag = tags.find(
    (item) => item.tagCode.toLowerCase() === lookupTagCode.toLowerCase()
  );

  if (!tag) {
    return mockResponse<PetTag | null>(null);
  }

  const pets = await getPets();
  const isRetailActivation = canActivateTagFromOwnerPortal(tag);
  const linkedPetId = tag.petId || petId;
  const pet = pets.data.find((item) => item.id === linkedPetId);

  if (!pet || !isActivePet(pet)) {
    return mockResponse<PetTag | null>(null);
  }

  if (
    !isRetailActivation &&
    (!tag.petId ||
      tag.status === "Active" ||
      tag.isArchived ||
      inactiveTagStatuses.includes(tag.status) ||
      !["Pending", "Preparing", "Delivered"].includes(tag.status))
  ) {
    return mockResponse<PetTag | null>(null);
  }

  const updatedTag: PetTag = {
    ...tag,
    petId: linkedPetId,
    status: "Active",
    activatedAt: formatToday(),
  };

  writeStoredCollection(
    TAG_STORAGE_KEY,
    tags.map((item) => (item.id === tag.id ? updatedTag : item))
  );

  if (tag.petId) {
    const orders = getOrderCollection();
    const order = orders.find((item) => item.tagId === tag.id);

    if (order?.status === "Shipped") {
      writeOrder(orders, {
        ...order,
        status: "Delivered",
        deliveredDate: formatToday(),
        trackingStatus: "Delivered and activated by owner.",
      });
    }
  }

  return mockResponse(updatedTag);
}

// --- Admin manual operations -------------------------------------------------
// These write to the same stored collections the owner portal reads, so the
// owner /orders and /tags pages stay consistent with admin changes.

function writeOrder(orders: TagOrder[], updatedOrder: TagOrder) {
  writeStoredCollection(
    ORDER_STORAGE_KEY,
    orders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
  );
}

// Keeps the linked tag's fulfillment status in step with the order. Only
// pending-family tags are touched — an already active or deactivated tag is
// never overwritten by order fulfillment.
function syncLinkedTag(
  tagId: string | undefined,
  update: (tag: PetTag) => PetTag
) {
  if (!tagId) {
    return;
  }

  const tags = getTagCollection();
  const tag = tags.find((item) => item.id === tagId);

  if (
    !tag ||
    tag.isArchived ||
    tag.status === "Active" ||
    inactiveTagStatuses.includes(tag.status)
  ) {
    return;
  }

  writeStoredCollection(
    TAG_STORAGE_KEY,
    tags.map((item) => (item.id === tagId ? update(tag) : item))
  );
}

// Backend admin action responses wrap the order with an owner summary.
type BackendAdminTagOrder = {
  order: BackendTagOrder;
  owner: { userId: string; email: string; displayName: string };
};

async function runAdminOrderAction(path: string, body?: unknown) {
  const response = await apiRequest<BackendAdminTagOrder>(path, {
    method: "POST",
    body: body ?? {},
  });

  return apiResponse<TagOrder | null>(
    {
      data: response.data ? mapBackendOrder(response.data.order) : null,
      meta: response.meta,
    },
    null
  );
}

export async function adminConfirmOrderPayment(orderId: string) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/confirm-payment`
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Payment Submitted") {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedOrder: TagOrder = {
    ...order,
    status: "Payment Confirmed",
    paymentConfirmedDate: formatToday(),
    paymentRejectionReason: undefined,
    trackingStatus: "Payment confirmed. Tag preparation is next.",
  };

  writeOrder(orders, updatedOrder);
  return mockResponse(updatedOrder);
}

// Returns the order to Pending Payment with a friendly reason. The order is
// never deleted, and the owner can resubmit proof.
export async function adminRejectOrderPayment(orderId: string, reason: string) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/reject-payment-proof`,
      { reason }
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Payment Submitted") {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedOrder: TagOrder = {
    ...order,
    status: "Pending Payment",
    paymentRejectionReason:
      reason.trim() ||
      "We could not verify this payment proof. Please resubmit your receipt.",
    trackingStatus: "Payment proof needs to be resubmitted.",
  };

  writeOrder(orders, updatedOrder);
  return mockResponse(updatedOrder);
}

export async function adminAssignInventoryTag(orderId: string, tagId: string) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/assign-tag`,
      { tagId }
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const tags = getTagCollection();
  const order = orders.find((item) => item.id === orderId);
  const tag = tags.find((item) => item.id === tagId);

  if (
    !order ||
    !tag ||
    order.status !== "Payment Confirmed" ||
    order.tagId ||
    tag.status !== "Unassigned" ||
    tag.petId ||
    tag.isArchived ||
    tag.hasNfc !== order.tagType.includes("NFC") ||
    tag.variant !== order.variant
  ) {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedTag: PetTag = {
    ...tag,
    petId: order.petId,
    status: "Preparing",
  };
  const updatedOrder: TagOrder = {
    ...order,
    tagId: tag.id,
    trackingStatus: "Inventory tag assigned. Tag preparation is next.",
  };

  writeStoredCollection(
    TAG_STORAGE_KEY,
    tags.map((item) => (item.id === tag.id ? updatedTag : item))
  );
  writeOrder(orders, updatedOrder);
  return mockResponse(updatedOrder);
}

export async function adminChangeAssignedTag(
  orderId: string,
  newTagId: string,
  reason?: string
) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/change-assigned-tag`,
      { newTagId, reason }
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const tags = getTagCollection();
  const order = orders.find((item) => item.id === orderId);
  const oldTag = tags.find((item) => item.id === order?.tagId);
  const newTag = tags.find((item) => item.id === newTagId);

  if (
    !order ||
    !oldTag ||
    !newTag ||
    (order.status !== "Payment Confirmed" && order.status !== "Preparing") ||
    newTag.id === oldTag.id ||
    newTag.status !== "Unassigned" ||
    newTag.petId ||
    newTag.isArchived ||
    newTag.hasNfc !== order.tagType.includes("NFC") ||
    newTag.variant !== order.variant
  ) {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedTags = tags.map((item) => {
    if (item.id === oldTag.id) {
      return { ...item, petId: undefined, status: "Unassigned" as TagStatus };
    }

    if (item.id === newTag.id) {
      return { ...item, petId: order.petId, status: "Preparing" as TagStatus };
    }

    return item;
  });
  const updatedOrder: TagOrder = {
    ...order,
    tagId: newTag.id,
    trackingStatus: "Assigned tag updated. Tag preparation is next.",
  };

  writeStoredCollection(TAG_STORAGE_KEY, updatedTags);
  writeOrder(orders, updatedOrder);
  return mockResponse(updatedOrder);
}

export async function adminReplaceTag(
  orderId: string,
  newTagId: string,
  reason: string,
  note?: string
) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/replace-tag`,
      { newTagId, reason, note }
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const tags = getTagCollection();
  const order = orders.find((item) => item.id === orderId);
  const oldTag = tags.find((item) => item.id === order?.tagId);
  const newTag = tags.find((item) => item.id === newTagId);
  const eligible =
    order &&
    (order.status === "Shipped" ||
      order.status === "Delivered" ||
      oldTag?.status === "Active");

  if (
    !order ||
    !oldTag ||
    !newTag ||
    !eligible ||
    !reason ||
    newTag.id === oldTag.id ||
    newTag.status !== "Unassigned" ||
    newTag.petId ||
    newTag.isArchived ||
    newTag.hasNfc !== order.tagType.includes("NFC") ||
    newTag.variant !== order.variant
  ) {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedTags = tags.map((item) => {
    if (item.id === oldTag.id) {
      // Keep the pet link for history; Replaced tags read as inactive.
      return { ...item, status: "Replaced" as TagStatus };
    }

    if (item.id === newTag.id) {
      return {
        ...item,
        petId: order.petId,
        status: "Preparing" as TagStatus,
        replacementForTagId: oldTag.id,
      };
    }

    return item;
  });
  const updatedOrder: TagOrder = {
    ...order,
    tagId: newTag.id,
    status: "Preparing",
    shippedDate: undefined,
    deliveredDate: undefined,
    trackingStatus: "A replacement tag is being prepared.",
  };

  writeStoredCollection(TAG_STORAGE_KEY, updatedTags);
  writeOrder(orders, updatedOrder);
  return mockResponse(updatedOrder);
}

export async function adminMarkOrderPreparing(orderId: string) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/mark-preparing`
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Payment Confirmed" || !order.tagId) {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedOrder: TagOrder = {
    ...order,
    status: "Preparing",
    trackingStatus: "Tag is being prepared",
  };

  writeOrder(orders, updatedOrder);
  syncLinkedTag(order.tagId, (tag) => ({ ...tag, status: "Preparing" }));
  return mockResponse(updatedOrder);
}

export async function adminMarkOrderShipped(orderId: string, trackingNumber?: string) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/mark-shipped`,
      { trackingNumber: trackingNumber?.trim() || null }
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Preparing" || !order.tagId) {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedOrder: TagOrder = {
    ...order,
    status: "Shipped",
    shippedDate: formatToday(),
    trackingNumber: trackingNumber?.trim() || order.trackingNumber,
    trackingStatus: `On the way to ${order.delivery.city || "you"}`,
  };

  writeOrder(orders, updatedOrder);
  return mockResponse(updatedOrder);
}

export async function adminMarkOrderDelivered(orderId: string) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/mark-delivered`
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Shipped" || !order.tagId) {
    return mockResponse<TagOrder | null>(null);
  }

  const deliveredDate = formatToday();
  const updatedOrder: TagOrder = {
    ...order,
    status: "Delivered",
    deliveredDate,
    trackingStatus: `Delivered to ${order.delivery.city || "the delivery address"}`,
  };

  writeOrder(orders, updatedOrder);
  syncLinkedTag(order.tagId, (tag) => ({
    ...tag,
    status: "Delivered",
    deliveredDate,
  }));
  return mockResponse(updatedOrder);
}

// Cancelling archives a linked tag that never became active, so it stops
// appearing in the owner's active/pending tag lists.
export async function adminCancelOrder(orderId: string, reason: string) {
  if (canUseOwnerTagApi()) {
    return runAdminOrderAction(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/cancel`,
      { reason }
    );
  }

  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);
  const cancellable: OrderStatus[] = [
    "Draft",
    "Pending Payment",
    "Payment Submitted",
    "Payment Confirmed",
    "Preparing",
  ];

  if (!order || !reason.trim() || !cancellable.includes(order.status)) {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedOrder: TagOrder = {
    ...order,
    status: "Cancelled",
    trackingStatus: "Cancelled",
  };

  writeOrder(orders, updatedOrder);
  syncLinkedTag(order.tagId, (tag) => ({ ...tag, isArchived: true }));
  return mockResponse(updatedOrder);
}

// Creates unclaimed retail stock: tags with a TagCode but no pet and no owner.
// Customers activate them through /t/{tagCode} after scanning or tapping.
export async function adminGenerateRetailTags(
  count: number,
  hasNfc: boolean,
  variant: TagVariant = "Standard"
) {
  if (canUseOwnerTagApi()) {
    const response = await apiRequest<{
      batchNo: string;
      quantity: number;
      tags: BackendSmartTag[];
    }>("/api/v1/admin/tag-inventory/generate", {
      method: "POST",
      body: {
        quantity: Math.max(1, Math.min(50, Math.floor(count))),
        tagType: hasNfc ? "QR_NFC" : "QR",
        variant,
      },
    });

    return apiResponse(
      {
        data: (response.data?.tags ?? []).map(mapBackendTag),
        meta: response.meta,
      },
      []
    );
  }

  await mockDelay();
  const safeCount = Math.max(1, Math.min(50, Math.floor(count)));
  const now = new Date();
  const batchNo = `BATCH-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const generatedDate = formatToday();
  const tags = getTagCollection();
  const newTags: PetTag[] = Array.from({ length: safeCount }, (_, index) => ({
    id: `tag_${Date.now()}_${index}`,
    tagCode: generateTagCode(),
    hasNfc,
    variant,
    status: "Unassigned",
    batchNo,
    orderedDate: generatedDate,
    isArchived: false,
  }));

  writeStoredCollection(TAG_STORAGE_KEY, [...newTags, ...tags]);
  return mockResponse(newTags);
}
