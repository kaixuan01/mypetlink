import { mockOrders } from "@/data/mockOrders";
import { mockTags } from "@/data/mockTags";
import { formatOrderNumber } from "@/lib/orders";
import { generateTagCode } from "@/lib/tagCodes";
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
  TagStatus,
  TagType,
} from "@/types";

const TAG_STORAGE_KEY = "mypetlink_tags";
const ORDER_STORAGE_KEY = "mypetlink_orders";

const disabledStatuses: TagStatus[] = ["Disabled", "Lost", "Replaced"];

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

// Resolves a scanned tag code to a finder state. The tag code is the single
// public identifier (printed on the tag, in the QR URL, and on the NFC chip),
// so this is the one place that decides what a scan shows.
export async function getFinderState(tagCode: string): Promise<FinderResult> {
  await mockDelay();
  const normalized = tagCode.trim();
  const tag = getTagCollection().find(
    (item) => item.tagCode.toLowerCase() === normalized.toLowerCase()
  );

  if (!tag) {
    return { state: "not-found", tagCode: normalized };
  }

  if (tag.isArchived || disabledStatuses.includes(tag.status)) {
    return {
      state: "inactive",
      tagCode: tag.tagCode,
      status: tag.status,
      isArchived: tag.isArchived,
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
  const tag = tags.find(
    (item) => item.tagCode.toLowerCase() === tagCode.trim().toLowerCase()
  );

  if (!tag) {
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
