import type { OrderStatus, PetTag, TagOrder, TagStatus } from "@/types";

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  "Draft",
  "Pending Payment",
  "Payment Submitted",
  "Payment Confirmed",
  "Preparing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

const activeOrderStatuses: OrderStatus[] = [
  "Pending Payment",
  "Payment Submitted",
  "Payment Confirmed",
  "Preparing",
  "Shipped",
];

const receiptStatuses: OrderStatus[] = [
  "Payment Confirmed",
  "Preparing",
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
  | "mark-preparing"
  | "mark-shipped"
  | "mark-delivered"
  | "cancel-order";

const cancellableOrderStatuses: OrderStatus[] = [
  "Draft",
  "Pending Payment",
  "Payment Submitted",
  "Payment Confirmed",
  "Preparing",
];

export function getAdminOrderActions(
  order: Pick<TagOrder, "status">
): AdminOrderAction[] {
  const actions: AdminOrderAction[] = [];

  if (order.status === "Payment Submitted") {
    actions.push("confirm-payment", "reject-payment");
  }

  if (order.status === "Payment Confirmed") {
    actions.push("mark-preparing");
  }

  if (order.status === "Preparing") {
    actions.push("mark-shipped");
  }

  if (order.status === "Shipped") {
    actions.push("mark-delivered");
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

export function buildPaymentReceiptText(order: TagOrder, petName: string) {
  return [
    "MyPetLink Payment Receipt",
    "MyPetLink by GBB Software Solutions",
    "Malaysia",
    "Contact: support@gbbsoftwaresolutions.com",
    "",
    `Order ID: ${formatOrderNumber(order)}`,
    `Payment date: ${order.paymentConfirmedDate ?? "Payment confirmed"}`,
    `Payment method: ${order.paymentMethod ?? "QR Payment"}`,
    `Amount paid: ${order.estimatedPrice}`,
    "Payment status: Payment Confirmed",
    "",
    `Pet name: ${petName}`,
    `Tag type: ${order.tagType}`,
    `Design: ${order.shape}`,
    `Delivery recipient: ${order.delivery.recipientName}`,
    `Delivery address: ${formatFullDeliveryAddress(order)}`,
  ].join("\n");
}
