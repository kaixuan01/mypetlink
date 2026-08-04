import type { OrderStatus, PetTag, TagOrder, TagStatus } from "@/types";

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  "Draft",
  "Pending Payment",
  "Payment Submitted",
  "Payment Confirmed",
  "Preparing",
  "Ready to Ship",
  "Shipped",
  "Delivered",
  "Cancelled",
];

const activeOrderStatuses: OrderStatus[] = [
  "Pending Payment",
  "Payment Submitted",
  "Payment Confirmed",
  "Preparing",
  "Ready to Ship",
  "Shipped",
];

const receiptStatuses: OrderStatus[] = [
  "Payment Confirmed",
  "Preparing",
  "Ready to Ship",
  "Shipped",
  "Delivered",
];

const replacementTagStatuses: TagStatus[] = [
  "Active",
  "Lost",
  "Disabled",
  "Replaced",
];

export function formatOrderNumber(order: Pick<TagOrder, "id" | "orderNumber">) {
  if (order.orderNumber) {
    return order.orderNumber;
  }

  const digits = order.id.replace(/\D/g, "");
  const sequence = (digits ? digits.slice(-4) : "0").padStart(4, "0");

  return `MPL-ORD-2026-${sequence}`;
}

export function getOrderStatusRank(status: OrderStatus) {
  const index = ORDER_STATUS_SEQUENCE.indexOf(status);
  return index === -1 ? 0 : index;
}

export function isActiveOrder(status: OrderStatus) {
  return activeOrderStatuses.includes(status);
}

export function canDownloadPaymentReceipt(order: Pick<TagOrder, "status">) {
  return receiptStatuses.includes(order.status);
}

export function canRequestReplacement(order: TagOrder, tag?: PetTag) {
  return Boolean(
    order.status === "Delivered" &&
      tag &&
      replacementTagStatuses.includes(tag.status)
  );
}

// Owner-facing status label. The internal status names stay unchanged; this is
// only how the status reads to a pet owner.
const orderStatusDisplay: Record<OrderStatus, string> = {
  Draft: "Draft",
  "Pending Payment": "Pending Payment",
  "Payment Submitted": "Payment Proof Submitted",
  "Payment Confirmed": "Payment Confirmed",
  Preparing: "Preparing Tag",
  "Ready to Ship": "Ready to Ship",
  Shipped: "Shipped",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
};

export function getOrderStatusDisplay(status: OrderStatus) {
  return orderStatusDisplay[status] ?? status;
}

export function getPaymentStatusLabel(order: TagOrder) {
  if (order.status === "Pending Payment") {
    return "Pending payment";
  }

  if (order.status === "Payment Submitted") {
    return "Payment proof under review";
  }

  if (canDownloadPaymentReceipt(order)) {
    return "Payment confirmed";
  }

  if (order.status === "Cancelled") {
    return "Cancelled";
  }

  return "Not submitted";
}

export function getOrderNextStep(order: TagOrder) {
  if (order.status === "Pending Payment") {
    return "Complete QR payment and upload your receipt or screenshot.";
  }

  if (order.status === "Payment Submitted") {
    return "We are reviewing your payment proof. Your order will be prepared after payment is confirmed.";
  }

  if (order.status === "Payment Confirmed") {
    return "Payment is confirmed. Tag preparation is next.";
  }

  if (order.status === "Preparing") {
    return "Your tag is being prepared.";
  }

  if (order.status === "Ready to Ship") {
    return "Your tag is packed and ready for the courier.";
  }

  if (order.status === "Shipped") {
    return "Your tag is on the way.";
  }

  if (order.status === "Delivered") {
    return "This order has been delivered.";
  }

  if (order.status === "Cancelled") {
    return "This order was cancelled.";
  }

  return "Review the order summary before payment.";
}

// Manual-operations actions available to the admin for an order in its
// current status. Payment confirmation is manual by product rule, so
// "confirm-payment" is only offered once the owner has submitted proof.
export type AdminOrderAction =
  | "confirm-payment"
  | "reject-payment"
  | "assign-tag"
  | "change-tag"
  | "replace-tag"
  | "mark-preparing"
  | "mark-ready-to-ship"
  | "edit-shipment"
  | "mark-shipped"
  | "mark-delivered"
  | "cancel-order";

const cancellableOrderStatuses: OrderStatus[] = [
  "Draft",
  "Pending Payment",
  "Payment Submitted",
  "Payment Confirmed",
  "Preparing",
  "Ready to Ship",
];

export function getAdminOrderActions(
  order: Pick<TagOrder, "status" | "tagId">
): AdminOrderAction[] {
  const actions: AdminOrderAction[] = [];

  if (order.status === "Payment Submitted") {
    actions.push("confirm-payment", "reject-payment");
  }

  if (order.status === "Payment Confirmed" && !order.tagId) {
    actions.push("assign-tag");
  }

  if (order.status === "Payment Confirmed" && order.tagId) {
    actions.push("mark-preparing");
  }

  // Before shipping, an assigned tag can be swapped for a different one.
  if (
    (order.status === "Payment Confirmed" || order.status === "Preparing" || order.status === "Ready to Ship") &&
    order.tagId
  ) {
    actions.push("change-tag");
  }

  // After shipping/delivery/activation, the tag can only be replaced.
  if (
    (order.status === "Shipped" || order.status === "Delivered") &&
    order.tagId
  ) {
    actions.push("replace-tag");
  }

  if (order.status === "Preparing") {
    actions.push("mark-ready-to-ship", "edit-shipment");
  }

  if (order.status === "Ready to Ship") {
    actions.push("edit-shipment", "mark-shipped");
  }

  if (order.status === "Shipped") {
    // Courier details stay editable after handover so a mistyped tracking
    // number can be corrected while the parcel is still in transit.
    actions.push("edit-shipment", "mark-delivered");
  }

  if (cancellableOrderStatuses.includes(order.status)) {
    actions.push("cancel-order");
  }

  return actions;
}

export function formatDeliverySummary(order: Pick<TagOrder, "delivery">) {
  return [order.delivery.addressLine1, order.delivery.city, order.delivery.state]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function formatFullDeliveryAddress(order: Pick<TagOrder, "delivery">) {
  return [
    order.delivery.addressLine1,
    order.delivery.addressLine2,
    [order.delivery.postcode, order.delivery.city]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" "),
    order.delivery.state,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Short destination for a compact summary: city and state only.
 *
 * Deliberately not a slice of the full address — the compact card must never
 * render a clipped copy of what the expanded details already show in full.
 */
export function formatDeliveryDestination(order: Pick<TagOrder, "delivery">) {
  return [order.delivery.city, order.delivery.state]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * What the owner may see about a shipment, derived once so the list and the
 * order detail page cannot drift apart.
 *
 * The server already withholds courier and tracking values before shipment, so
 * this only decides presentation. Note that `trackingNumber` and `trackingUrl`
 * are independent: a courier with no configured tracking template still yields
 * a usable number, and the number must be shown either way.
 */
export type OrderShipmentView = {
  /** True once the parcel has been handed to the courier. */
  visible: boolean;
  courierName?: string;
  courierService?: string;
  trackingNumber?: string;
  /** Only present when a safe courier template produced one server-side. */
  trackingUrl?: string;
  shippedDate?: string;
  deliveredDate?: string;
};

export function getOrderShipmentView(order: TagOrder): OrderShipmentView {
  const visible =
    Boolean(order.shippedDate) ||
    order.status === "Shipped" ||
    order.status === "Delivered";

  if (!visible) {
    return { visible: false };
  }

  return {
    visible: true,
    courierName: order.courierProvider || undefined,
    courierService: order.courierService || undefined,
    trackingNumber: order.trackingNumber || undefined,
    trackingUrl: order.trackingUrl || undefined,
    shippedDate: order.shippedDate || undefined,
    deliveredDate: order.deliveredDate || undefined,
  };
}

/**
 * Compact fulfilment wording for the summary row. Before shipment this
 * describes progress instead of showing an empty courier field.
 */
export function getShipmentSummaryLabel(order: TagOrder): {
  label: string;
  value: string;
} {
  const shipment = getOrderShipmentView(order);
  if (shipment.visible) {
    return { label: "Shipment", value: shipment.courierName ?? "Handed to courier" };
  }

  switch (order.status) {
    case "Preparing":
      return { label: "Fulfilment", value: "Preparing" };
    case "Ready to Ship":
      return { label: "Fulfilment", value: "Ready to ship" };
    case "Cancelled":
      return { label: "Fulfilment", value: "Cancelled" };
    default:
      return { label: "Fulfilment", value: "Awaiting shipment" };
  }
}
