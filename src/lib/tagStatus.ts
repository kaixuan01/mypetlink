import { getOrderStatusDisplay } from "@/lib/orders";
import type { OrderStatus, PetTag, TagOrder, TagStatus } from "@/types";

export type TagFilter = "active" | "pending" | "inactive" | "archived" | "all";

export type TagAction =
  | "view-tag-scan-page"
  | "copy-tag-scan-link"
  | "report-tag-lost"
  | "disable-tag"
  | "pay-by-qr"
  | "view-payment-status"
  | "view-order"
  | "view-preparation-status"
  | "activate-tag"
  | "view-inactive-tag-page"
  | "request-replacement"
  | "archive-tag"
  | "view-status"
  | "restore-to-list";

export const inactiveTagStatuses: TagStatus[] = [
  "Lost",
  "Disabled",
  "Replaced",
  "Archived",
];

export const pendingTagStatuses: TagStatus[] = [
  "Pending",
  "Preparing",
  "Delivered",
];

export const pendingOrderStatuses: OrderStatus[] = [
  "Pending Payment",
  "Payment Submitted",
  "Payment Confirmed",
  "Preparing",
  "Shipped",
  "Delivered",
];

export function getTagOrder(tag: PetTag, orders: TagOrder[] = []) {
  return orders.find((order) => order.tagId === tag.id);
}

export function isActivePhysicalTag(tag: PetTag) {
  return tag.status === "Active" && !tag.isArchived;
}

export function isInactivePhysicalTag(tag: PetTag) {
  return inactiveTagStatuses.includes(tag.status) || Boolean(tag.isArchived);
}

export function isPendingOrderStatus(status: OrderStatus) {
  return pendingOrderStatuses.includes(status);
}

export function isPendingPhysicalTag(tag: PetTag, order?: TagOrder) {
  if (
    tag.isArchived ||
    tag.status === "Active" ||
    inactiveTagStatuses.includes(tag.status)
  ) {
    return false;
  }

  return (
    pendingTagStatuses.includes(tag.status) ||
    Boolean(order && isPendingOrderStatus(order.status))
  );
}

export function canActivateTagFromOwnerPortal(tag: PetTag) {
  return !tag.isArchived && (tag.status === "Unassigned" || tag.status === "Delivered");
}

export function getTagDisplayStatus(tag: PetTag, order?: TagOrder) {
  if (tag.isArchived) {
    return "Archived";
  }

  if (isActivePhysicalTag(tag) || inactiveTagStatuses.includes(tag.status)) {
    return tag.status;
  }

  if (tag.status === "Delivered" && !tag.activatedAt) {
    return "Delivered - activation pending";
  }

  if (order && isPendingPhysicalTag(tag, order)) {
    return getOrderStatusDisplay(order.status);
  }

  return tag.status;
}

export function getTagScanDisplay(tag: PetTag, order?: TagOrder) {
  if (isActivePhysicalTag(tag)) {
    return {
      label: "Last scanned",
      value: tag.lastScannedAt ?? "No scans yet",
    };
  }

  if (isPendingPhysicalTag(tag, order) || tag.status === "Unassigned") {
    return {
      label: "Scan history",
      value: "Available after tag activation",
    };
  }

  if (isInactivePhysicalTag(tag)) {
    return tag.lastScannedAt
      ? {
          label: "Last scanned before deactivation",
          value: tag.lastScannedAt,
        }
      : {
          label: "Scan history",
          value: "No scan history",
        };
  }

  return {
    label: "Scan history",
    value: "No scan history",
  };
}

export function getTagAvailableActions(tag: PetTag, order?: TagOrder): TagAction[] {
  if (tag.isArchived) {
    return ["view-status", "restore-to-list"];
  }

  if (isActivePhysicalTag(tag)) {
    return [
      "view-tag-scan-page",
      "copy-tag-scan-link",
      "report-tag-lost",
      "disable-tag",
    ];
  }

  if (inactiveTagStatuses.includes(tag.status)) {
    return ["view-inactive-tag-page", "request-replacement", "archive-tag"];
  }

  if (tag.status === "Unassigned") {
    return ["activate-tag"];
  }

  if (tag.status === "Delivered") {
    return order ? ["activate-tag", "view-order"] : ["activate-tag"];
  }

  if (order?.status === "Pending Payment") {
    return ["pay-by-qr", "view-order"];
  }

  if (order?.status === "Payment Submitted") {
    return ["view-payment-status", "view-order"];
  }

  if (order?.status === "Payment Confirmed" || order?.status === "Preparing") {
    return ["view-order", "view-preparation-status"];
  }

  if (order && isPendingOrderStatus(order.status)) {
    return ["view-order"];
  }

  if (isPendingPhysicalTag(tag, order)) {
    return order ? ["view-order"] : ["view-status"];
  }

  return ["view-status"];
}

export function shouldShowTagForFilter(
  tag: PetTag,
  filter: TagFilter,
  order?: TagOrder
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "archived") {
    return Boolean(tag.isArchived);
  }

  if (tag.isArchived) {
    return false;
  }

  if (filter === "active") {
    return isActivePhysicalTag(tag);
  }

  if (filter === "pending") {
    return isPendingPhysicalTag(tag, order);
  }

  return inactiveTagStatuses.includes(tag.status);
}

export function compareTagsForDisplay(
  a: PetTag,
  b: PetTag,
  orders: TagOrder[] = []
) {
  const rankDiff = getTagSortRank(a, getTagOrder(a, orders)) -
    getTagSortRank(b, getTagOrder(b, orders));

  if (rankDiff !== 0) {
    return rankDiff;
  }

  const dateA = a.activatedAt ?? a.deliveredDate ?? a.orderedDate ?? "";
  const dateB = b.activatedAt ?? b.deliveredDate ?? b.orderedDate ?? "";

  return dateB.localeCompare(dateA) || a.tagCode.localeCompare(b.tagCode);
}

export function getPetSmartTagStatus(
  tags: PetTag[] = [],
  orders: TagOrder[] = [],
  petId?: string
) {
  const scopedTags = tags.filter(
    (tag) => (!petId || tag.petId === petId) && !tag.isArchived
  );
  const scopedOrders = orders.filter((order) => !petId || order.petId === petId);
  const hasActiveTag = scopedTags.some(isActivePhysicalTag);
  const hasPendingTag = scopedTags.some((tag) =>
    isPendingPhysicalTag(tag, getTagOrder(tag, orders))
  );
  const hasPendingOrder = scopedOrders.some((order) =>
    isPendingOrderStatus(order.status)
  );

  if (hasActiveTag) {
    return "active";
  }

  if (hasPendingTag || hasPendingOrder) {
    return "pending";
  }

  return "none";
}

export function getPetNfcTagStatus(
  tags: PetTag[] = [],
  orders: TagOrder[] = [],
  petId?: string
) {
  const scopedTags = tags.filter(
    (tag) => (!petId || tag.petId === petId) && tag.hasNfc && !tag.isArchived
  );
  const scopedOrders = orders.filter(
    (order) =>
      (!petId || order.petId === petId) &&
      order.tagType === "MyPetLink QR + NFC Smart Tag"
  );

  if (scopedTags.some(isActivePhysicalTag)) {
    return "active";
  }

  if (
    scopedTags.some((tag) => isPendingPhysicalTag(tag, getTagOrder(tag, orders))) ||
    scopedOrders.some((order) => isPendingOrderStatus(order.status))
  ) {
    return "pending";
  }

  return "none";
}

function getTagSortRank(tag: PetTag, order?: TagOrder) {
  if (isActivePhysicalTag(tag)) {
    return 0;
  }

  if (isPendingPhysicalTag(tag, order)) {
    return 1;
  }

  if (inactiveTagStatuses.includes(tag.status)) {
    return 2;
  }

  if (tag.isArchived) {
    return 3;
  }

  return 4;
}
