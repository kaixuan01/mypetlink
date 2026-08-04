import { getOrderStatusDisplay } from "@/lib/orders";
import { isActivePet, isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
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

type LinkedPetLifecycle = Parameters<typeof isActivePet>[0];

export function getTagOrder(tag: PetTag, orders: TagOrder[] = []) {
  return (
    orders.find((order) => order.tagId === tag.id) ??
    orders.find((order) => tag.orderId && order.id === tag.orderId)
  );
}

/**
 * The physical tag reserved for an order.
 *
 * An order only lists its assigned tags once it has shipped, so before then the
 * link has to be read from the owner's own tags. Without this a reserved tag
 * looked unassigned on the order pages while the Smart Tags page showed it.
 */
export function findOrderLinkedTag(
  order: Pick<TagOrder, "id" | "tagId">,
  tags: PetTag[] = []
) {
  return (
    (order.tagId ? tags.find((tag) => tag.id === order.tagId) : undefined) ??
    tags.find((tag) => tag.orderId === order.id)
  );
}

export function isActivePhysicalTag(tag: PetTag) {
  return tag.status === "Active" && !tag.isArchived;
}

export function isActivePhysicalTagForPet(
  tag: PetTag,
  linkedPet?: LinkedPetLifecycle
) {
  return isActivePhysicalTag(tag) && (!linkedPet || isActivePet(linkedPet));
}

export function isTagLinkedToInactivePet(
  tag: PetTag,
  linkedPet?: LinkedPetLifecycle
) {
  return Boolean(tag.petId && linkedPet && !isActivePet(linkedPet));
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
  return !tag.isArchived && tag.status === "Unassigned" && !tag.petId;
}

/**
 * Owner-facing activation state of a physical tag.
 *
 * `TagStatus` carries two different ideas in one field: how far the tag has
 * travelled towards the owner (`Pending`, `Preparing`, `Delivered`) and what
 * the tag itself is doing (`Active`, `Lost`, `Disabled`, `Replaced`,
 * `Archived`). Only the second group describes activation. Showing the first
 * group verbatim is what produced "Tag status — Preparing" on an order that
 * had already shipped.
 *
 * This collapses the pre-activation values to one honest answer and never
 * consults the order, so a tag can never report a fulfilment step as its own
 * activation state.
 */
export type TagActivationState =
  | "Not assigned yet"
  | "Awaiting activation"
  | "Active"
  | "Lost"
  | "Disabled"
  | "Replaced"
  | "Archived";

export type TagActivationInput = {
  status: string;
  isArchived?: boolean;
  activatedAt?: string;
};

export function getTagActivationState(
  tag: TagActivationInput
): TagActivationState {
  // Archival is a shelf state that outranks whatever the tag was doing before.
  if (tag.isArchived || tag.status === "Archived") {
    return "Archived";
  }

  // A replaced, lost or disabled tag stays in that state even though it was
  // activated at some point, so these are checked before `activatedAt`.
  if (tag.status === "Replaced") return "Replaced";
  if (tag.status === "Lost") return "Lost";
  if (tag.status === "Disabled") return "Disabled";

  // Activation is recorded on the tag itself, never derived from the order.
  if (tag.status === "Active" || tag.activatedAt) {
    return "Active";
  }

  if (tag.status === "Unassigned") {
    return "Not assigned yet";
  }

  // Pending / Preparing / Delivered: reserved for this owner, still waiting to
  // be scanned or tapped.
  return "Awaiting activation";
}

export type OrderTagActivation = {
  id: string;
  tagCode: string;
  petName: string;
  state: TagActivationState;
};

/**
 * Activation state of every physical tag assigned to an order.
 *
 * A multi-tag order can hold tags at different points — one activated, one
 * still in the envelope — so the order surfaces list them individually rather
 * than collapsing them into a single misleading answer. Orders placed before
 * multi-item checkout carry no item-level tags, so the owner's linked tag is
 * used instead.
 */
export function getOrderTagActivations(
  order: Pick<TagOrder, "items" | "petName">,
  linkedTag?: PetTag
): OrderTagActivation[] {
  const fromItems = (order.items ?? []).flatMap((item) =>
    item.assignedTags.map((tag) => ({
      id: tag.id,
      tagCode: tag.tagCode,
      petName: tag.petName || item.petName,
      state: getTagActivationState({ status: tag.status }),
    }))
  );

  if (fromItems.length > 0) {
    return fromItems;
  }

  if (linkedTag) {
    return [
      {
        id: linkedTag.id,
        tagCode: linkedTag.tagCode,
        petName: order.petName ?? "Pet",
        state: getTagActivationState(linkedTag),
      },
    ];
  }

  return [];
}

/**
 * One activation answer for an order, used only when every tag agrees.
 * Returns undefined when the tags differ, so the caller lists them instead.
 */
export function getSharedTagActivationState(
  activations: OrderTagActivation[]
): TagActivationState | undefined {
  if (activations.length === 0) {
    return "Not assigned yet";
  }

  const first = activations[0].state;
  return activations.every((entry) => entry.state === first) ? first : undefined;
}

/**
 * Activation wording for the physical units on one order line.
 *
 * A line can cover several tags, so one line reads as a count rather than a
 * list of identical answers, and a line whose tags disagree reads as a short
 * breakdown instead of a single state that would be wrong for some of them.
 * Tag codes are deliberately not included: this is the priced item summary,
 * and the code is only disclosed where existing owner policy already allows.
 */
export function summariseTagActivation(
  states: TagActivationState[]
): string[] {
  if (states.length === 0) {
    return [];
  }

  if (states.length === 1) {
    return [states[0]];
  }

  const counts = new Map<TagActivationState, number>();
  for (const state of states) {
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }

  if (counts.size === 1) {
    const [state] = counts.keys();
    return [`${states.length} tags ${state.charAt(0).toLowerCase()}${state.slice(1)}`];
  }

  return [...counts.entries()].map(([state, count]) => `${count} ${state}`);
}

/**
 * Activation wording for one order line, so a tag's state stays attached to the
 * item it belongs to rather than being averaged across the whole order.
 *
 * An order withholds its assigned tags until it ships. Before then a
 * single-line order can still report the tag reserved for it, which the owner
 * already sees on the Smart Tags page; a multi-line order cannot attribute a
 * reserved tag to a particular line, so it says so plainly.
 */
export function getOrderItemActivationLines(
  order: Pick<TagOrder, "items">,
  itemIndex: number,
  linkedTag?: PetTag
): string[] {
  const items = order.items ?? [];
  const assigned = items[itemIndex]?.assignedTags ?? [];

  if (assigned.length > 0) {
    return summariseTagActivation(
      assigned.map((tag) => getTagActivationState({ status: tag.status }))
    );
  }

  if (items.length <= 1 && linkedTag) {
    return [getTagActivationState(linkedTag)];
  }

  return ["Not assigned yet"];
}

export function getTagDisplayStatus(
  tag: PetTag,
  order?: TagOrder,
  linkedPet?: LinkedPetLifecycle
) {
  if (tag.isArchived) {
    return "Archived";
  }

  if (isTagLinkedToInactivePet(tag, linkedPet)) {
    if (isMemorialPet(linkedPet)) {
      return "Inactive - memorial profile";
    }

    if (isArchivedPet(linkedPet)) {
      return "Inactive - archived profile";
    }

    return "Inactive";
  }

  if (isActivePhysicalTag(tag) || inactiveTagStatuses.includes(tag.status)) {
    return tag.status;
  }

  // Once a physical tag is reserved for this owner, the tag card reports the
  // tag's own state. The order's fulfilment progress is still one click away
  // on the linked order, so the two are never shown as the same thing.
  if (pendingTagStatuses.includes(tag.status)) {
    return "Awaiting activation";
  }

  // Before a tag is assigned there is nothing to activate yet, so the order's
  // fulfilment progress is the only meaningful answer.
  if (order && isPendingOrderStatus(order.status)) {
    return getOrderStatusDisplay(order.status);
  }

  return getTagActivationState(tag);
}

export function getTagScanDisplay(
  tag: PetTag,
  order?: TagOrder,
  linkedPet?: LinkedPetLifecycle
) {
  if (isTagLinkedToInactivePet(tag, linkedPet)) {
    return {
      label: "Scan behavior",
      value: isMemorialPet(linkedPet)
        ? "Shows inactive memorial tag page"
        : "Shows inactive tag page",
    };
  }

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

export function getTagAvailableActions(
  tag: PetTag,
  order?: TagOrder,
  linkedPet?: LinkedPetLifecycle
): TagAction[] {
  if (tag.isArchived) {
    return ["view-status", "restore-to-list"];
  }

  if (isTagLinkedToInactivePet(tag, linkedPet)) {
    return ["view-inactive-tag-page", "disable-tag", "archive-tag"];
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
    return ["view-tag-scan-page", "copy-tag-scan-link"];
  }

  if (tag.petId && pendingTagStatuses.includes(tag.status)) {
    return order
      ? ["view-tag-scan-page", "copy-tag-scan-link", "view-order"]
      : ["view-tag-scan-page", "copy-tag-scan-link"];
  }

  if (order?.status === "Pending Payment") {
    return ["pay-by-qr", "view-order"];
  }

  if (order?.status === "Payment Submitted") {
    return ["view-payment-status", "view-order"];
  }

  if (order?.status === "Payment Confirmed" || order?.status === "Preparing" || order?.status === "Ready to Ship") {
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
  order?: TagOrder,
  linkedPet?: LinkedPetLifecycle
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

  const linkedToInactivePet = isTagLinkedToInactivePet(tag, linkedPet);

  if (filter === "active") {
    return isActivePhysicalTagForPet(tag, linkedPet);
  }

  if (filter === "pending") {
    return !linkedToInactivePet && isPendingPhysicalTag(tag, order);
  }

  return inactiveTagStatuses.includes(tag.status) || linkedToInactivePet;
}

export function compareTagsForDisplay(
  a: PetTag,
  b: PetTag,
  orders: TagOrder[] = [],
  linkedPetA?: LinkedPetLifecycle,
  linkedPetB?: LinkedPetLifecycle
) {
  const rankDiff = getTagSortRank(a, getTagOrder(a, orders), linkedPetA) -
    getTagSortRank(b, getTagOrder(b, orders), linkedPetB);

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
  petId?: string,
  linkedPet?: LinkedPetLifecycle
) {
  const scopedTags = tags.filter(
    (tag) => (!petId || tag.petId === petId) && !tag.isArchived
  );
  const scopedOrders = orders.filter((order) => !petId || order.petId === petId);
  const hasActiveTag = scopedTags.some((tag) =>
    isActivePhysicalTagForPet(tag, linkedPet)
  );
  const isLinkedPetActive = !linkedPet || isActivePet(linkedPet);
  const hasPendingTag = scopedTags.some((tag) =>
    isLinkedPetActive && isPendingPhysicalTag(tag, getTagOrder(tag, orders))
  );
  const hasPendingOrder =
    isLinkedPetActive &&
    scopedOrders.some((order) => isPendingOrderStatus(order.status));

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
  petId?: string,
  linkedPet?: LinkedPetLifecycle
) {
  const scopedTags = tags.filter(
    (tag) => (!petId || tag.petId === petId) && tag.hasNfc && !tag.isArchived
  );
  const scopedOrders = orders.filter(
    (order) =>
      (!petId || order.petId === petId) &&
      order.tagType === "MyPetLink QR + NFC Smart Tag"
  );

  if (scopedTags.some((tag) => isActivePhysicalTagForPet(tag, linkedPet))) {
    return "active";
  }

  if (linkedPet && !isActivePet(linkedPet)) {
    return "none";
  }

  if (
    scopedTags.some((tag) => isPendingPhysicalTag(tag, getTagOrder(tag, orders))) ||
    scopedOrders.some((order) => isPendingOrderStatus(order.status))
  ) {
    return "pending";
  }

  return "none";
}

function getTagSortRank(
  tag: PetTag,
  order?: TagOrder,
  linkedPet?: LinkedPetLifecycle
) {
  if (isActivePhysicalTagForPet(tag, linkedPet)) {
    return 0;
  }

  if (isTagLinkedToInactivePet(tag, linkedPet)) {
    return 2;
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
