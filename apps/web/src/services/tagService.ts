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
import { getPets, toPublicProfile } from "@/services/petService";
import type {
  FinderResult,
  OrderStatus,
  PetTag,
  TagOrder,
  TagOrderPayload,
  TagShape,
  TagStatus,
  TagType,
} from "@/types";

const TAG_STORAGE_KEY = "mypetlink_tags";
const ORDER_STORAGE_KEY = "mypetlink_orders";

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

function isNfcTag(tagType: TagType) {
  return tagType === "MyPetLink QR + NFC Smart Tag";
}

export function getEstimatedTagPrice(tagType: TagType) {
  return tagType === "MyPetLink QR + NFC Smart Tag" ? "RM39.90" : "RM19.90";
}

export async function getPetTags(petId: string) {
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
  await mockDelay();
  const tags = getTagCollection();

  return mockResponse(tags, {
    page: 1,
    pageSize: tags.length,
    total: tags.length,
  });
}

export async function getOrders() {
  await mockDelay();
  const orders = getOrderCollection();

  return mockResponse(orders, {
    page: 1,
    pageSize: orders.length,
    total: orders.length,
  });
}

export async function getOrder(orderKey: string) {
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
  await mockDelay();
  const tags = getTagCollection();
  const orders = getOrderCollection();
  const tagId = `tag_${Date.now()}`;
  const orderId = `order_${Date.now()}`;
  const orderedDate = formatToday();
  const tag: PetTag = {
    id: tagId,
    tagCode: generateTagCode(),
    petId: payload.petId,
    hasNfc: isNfcTag(payload.tagType),
    shape: payload.shape,
    status: "Pending",
    orderedDate,
    replacementForTagId: payload.replacementForTagId,
    isArchived: false,
  };
  const order: TagOrder = {
    id: orderId,
    orderNumber: formatOrderNumber({ id: orderId }),
    petId: payload.petId,
    tagType: payload.tagType,
    shape: payload.shape,
    delivery: payload.delivery,
    estimatedPrice: getEstimatedTagPrice(payload.tagType),
    status: "Pending Payment",
    orderedDate,
    tagId,
    replacementForTagId: payload.replacementForTagId,
    paymentMethod: "QR Payment",
  };
  const nextTags = payload.replacementForTagId
    ? [
        tag,
        ...tags.map((item) =>
          item.id === payload.replacementForTagId
            ? { ...item, status: "Replaced" as TagStatus }
            : item
        ),
      ]
    : [tag, ...tags];

  writeStoredCollection(TAG_STORAGE_KEY, nextTags);
  writeStoredCollection(ORDER_STORAGE_KEY, [order, ...orders]);

  return mockResponse({ order, tag });
}

type OrderPaymentProof = {
  paymentReference?: string;
  paymentNote?: string;
  paymentProofName?: string;
};

// Phase 1 manual payment: record the owner's receipt / screenshot file name and
// optional bank or eWallet transaction ID, then move the order to
// "Payment Submitted" for manual verification. The order is never marked
// Payment Confirmed automatically.
export async function submitOrderPayment(
  orderId: string,
  proof: OrderPaymentProof
) {
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
  await mockDelay();
  return updateTagStatus(tagId, "Disabled");
}

export async function reportTagLost(tagId: string) {
  await mockDelay();
  return updateTagStatus(tagId, "Lost");
}

export async function orderReplacementTag(tagId: string) {
  await mockDelay();
  return updateTagStatus(tagId, "Replaced");
}

export async function archiveTag(tagId: string) {
  await mockDelay();
  return updateTagArchiveState(tagId, true);
}

export async function restoreTag(tagId: string) {
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
// pet-level QR Safety Page content; inactive tags never expose owner contact.
export async function getFinderState(tagCode: string): Promise<FinderResult> {
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

  return {
    state: "active",
    tagCode: tag.tagCode,
    profile: toPublicProfile(pet),
  };
}

// Binds an unassigned tag to a pet and marks it Active. The tag code never
// changes during activation — only the pet binding and status do.
export async function activateTag(tagCode: string, petId: string) {
  await mockDelay();
  const tags = getTagCollection();
  const lookupTagCode = resolveTagCodeAlias(tagCode);
  const tag = tags.find(
    (item) => item.tagCode.toLowerCase() === lookupTagCode.toLowerCase()
  );

  if (!tag || !canActivateTagFromOwnerPortal(tag)) {
    return mockResponse<PetTag | null>(null);
  }

  const pets = await getPets();
  const pet = pets.data.find((item) => item.id === petId);

  if (!pet || !isActivePet(pet)) {
    return mockResponse<PetTag | null>(null);
  }

  const updatedTag: PetTag = {
    ...tag,
    petId,
    status: "Active",
    activatedAt: formatToday(),
  };

  writeStoredCollection(
    TAG_STORAGE_KEY,
    tags.map((item) => (item.id === tag.id ? updatedTag : item))
  );

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

export async function adminConfirmOrderPayment(orderId: string) {
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

export async function adminMarkOrderPreparing(orderId: string) {
  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Payment Confirmed") {
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

export async function adminMarkOrderShipped(orderId: string) {
  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Preparing") {
    return mockResponse<TagOrder | null>(null);
  }

  const updatedOrder: TagOrder = {
    ...order,
    status: "Shipped",
    shippedDate: formatToday(),
    trackingStatus: `On the way to ${order.delivery.city || "you"}`,
  };

  writeOrder(orders, updatedOrder);
  return mockResponse(updatedOrder);
}

export async function adminMarkOrderDelivered(orderId: string) {
  await mockDelay();
  const orders = getOrderCollection();
  const order = orders.find((item) => item.id === orderId);

  if (!order || order.status !== "Shipped") {
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
export async function adminCancelOrder(orderId: string) {
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

  if (!order || !cancellable.includes(order.status)) {
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
// Customers activate them through /activate/{tagCode} after scanning.
export async function adminGenerateRetailTags(
  count: number,
  hasNfc: boolean,
  shape: TagShape = "Round"
) {
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
    shape,
    status: "Unassigned",
    batchNo,
    orderedDate: generatedDate,
    isArchived: false,
  }));

  writeStoredCollection(TAG_STORAGE_KEY, [...newTags, ...tags]);
  return mockResponse(newTags);
}
