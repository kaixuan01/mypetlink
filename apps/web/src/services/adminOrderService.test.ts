// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  countAdminOrders,
  getAdminOrderAvailableActions,
  getAdminOrderExportFormats,
  listAdminOrders,
  type AdminOrder,
} from "@/services/adminOrderService";
import type { OrderStatus, TagOrder } from "@/types";

const base = { page: 1, pageSize: 100, orderNumber: "TEST-ORD" };

function order(id: string, status: OrderStatus, options: Partial<TagOrder> = {}): TagOrder {
  return {
    id,
    orderNumber: `TEST-ORD-${id.toUpperCase()}`,
    petId: "pet_topu",
    petName: "Topu",
    tagType: id.includes("nfc")
      ? "MyPetLink QR + NFC Smart Tag"
      : "MyPetLink QR Pet Tag",
    variant: id.includes("light") ? "Lightweight" : "Standard",
    delivery: {
      recipientName: "Aina Owner",
      phone: "+60123456789",
      addressLine1: "1 Jalan Ampang",
      addressLine2: "",
      postcode: "50450",
      city: "Kuala Lumpur",
      state: "Kuala Lumpur",
      notes: "",
    },
    estimatedPrice: id.includes("nfc") ? "RM59" : "RM39",
    status,
    orderedDate: `2026-07-${id === "pending" ? "01" : id === "review" ? "02" : "03"}T00:00:00Z`,
    ...options,
  };
}

function seed() {
  const rows: TagOrder[] = [
    order("pending", "Pending Payment"),
    order("review", "Payment Submitted", {
      paymentProofName: "receipt.jpg",
      paymentSubmittedDate: "2026-07-03T00:00:00Z",
      paymentReference: "REF-REVIEW",
      paymentProofs: [{ id: "proof-1", status: "PendingReview", originalFileName: "receipt.jpg", paymentMethod: "QR Payment", paymentReference: "REF-REVIEW", submittedLabel: "03 Jul 2026" }],
    }),
    order("nfc-paid", "Payment Confirmed", { paymentConfirmedDate: "2026-07-04T00:00:00Z" }),
    order("nfc-light-preparing", "Preparing", { tagId: "tag-1", paymentConfirmedDate: "2026-07-04T00:00:00Z" }),
    order("shipped", "Shipped", { tagId: "tag-2", trackingNumber: "TRACK-123", shippedDate: "2026-07-05T00:00:00Z", paymentConfirmedDate: "2026-07-04T00:00:00Z" }),
    order("delivered", "Delivered", { tagId: "tag-3", deliveredDate: "2026-07-06T00:00:00Z", shippedDate: "2026-07-05T00:00:00Z", paymentConfirmedDate: "2026-07-04T00:00:00Z" }),
    order("cancelled", "Cancelled"),
  ];
  window.localStorage.setItem("mypetlink_orders", JSON.stringify(rows));
}

beforeEach(() => {
  window.localStorage.clear();
  seed();
});

describe("Admin Orders local query parity", () => {
  it("applies search and explicit payment, fulfilment, proof, type and assignment filters", async () => {
    expect((await listAdminOrders({ ...base, search: "REF-REVIEW" })).items.map((item) => item.id)).toEqual(["review"]);
    expect((await listAdminOrders({ ...base, paymentStatus: "Confirmed" })).total).toBe(4);
    expect((await listAdminOrders({ ...base, fulfilmentStatus: "Preparing" })).items.map((item) => item.id)).toEqual(["nfc-light-preparing"]);
    expect((await listAdminOrders({ ...base, hasProof: "true" })).items.map((item) => item.id)).toEqual(["review"]);
    expect((await listAdminOrders({ ...base, tagType: "QR_NFC" })).items.map((item) => item.id).sort()).toEqual(["nfc-light-preparing", "nfc-paid"]);
    expect((await listAdminOrders({ ...base, hasAssignedTag: "false" })).items.some((item) => item.id === "pending")).toBe(true);
    expect((await listAdminOrders({ ...base, hasTracking: "true" })).items.map((item) => item.id)).toEqual(["shipped"]);
  });

  it("computes stage counts with non-stage filters and never from a visible page", async () => {
    const counts = await countAdminOrders({ ...base, pageSize: 1, stage: "delivered", paymentStatus: "Confirmed" });
    expect(counts.all).toBe(4);
    expect(counts.readyToPrepare).toBe(1);
    expect(counts.preparing).toBe(1);
    expect(counts.shipped).toBe(1);
    expect(counts.delivered).toBe(1);
  });

  it("sorts and paginates deterministically", async () => {
    const first = await listAdminOrders({ ...base, page: 1, pageSize: 2, sortBy: "orderNumber", sortDir: "asc" });
    const second = await listAdminOrders({ ...base, page: 2, pageSize: 2, sortBy: "orderNumber", sortDir: "asc" });
    expect(first.total).toBe(7);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(4);
  });
});

describe("Admin Orders operational actions", () => {
  const summary: AdminOrder = {
    id: "paid",
    orderNumber: "MPL-ORD-PAID",
    ownerName: "Aina",
    ownerEmail: "aina@example.com",
    ownerPhone: "+60123456789",
    petId: "pet_topu",
    petName: "Topu",
    hasNfc: false,
    variant: "Standard",
    amount: 39,
    currency: "MYR",
    deliveryFee: 8,
    orderStatus: "Payment Confirmed",
    paymentStatus: "Confirmed",
    fulfilmentStatus: "NotStarted",
    hasPaymentProof: true,
    deliveryCity: "Kuala Lumpur",
    deliveryState: "Kuala Lumpur",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };

  it("shows only valid state-aware actions", () => {
    expect(getAdminOrderAvailableActions(summary)).toEqual(["assign-tag", "cancel-order"]);
    expect(getAdminOrderAvailableActions({ ...summary, orderStatus: "Preparing", assignedTagId: "tag-1", fulfilmentStatus: "Preparing" })).toEqual(["change-tag", "mark-shipped", "cancel-order"]);
    expect(getAdminOrderAvailableActions({ ...summary, orderStatus: "Delivered", assignedTagId: "tag-1", fulfilmentStatus: "Delivered" })).toEqual(["replace-tag"]);
  });

  it("keeps bulk operations conservative and supports CSV locally", () => {
    expect(getAdminOrderExportFormats()).toEqual(["csv"]);
  });
});
