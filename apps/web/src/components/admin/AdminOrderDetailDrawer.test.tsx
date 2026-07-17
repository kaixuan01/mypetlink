// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendTagOrder } from "@/services/apiDtos";
import type { AdminOrder, AdminOrderDetail } from "@/services/adminOrderService";
import type { TagOrder } from "@/types";
import { AdminOrderDetailDrawer } from "./AdminOrderDetailDrawer";

const serviceMocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  getHistory: vi.fn(),
  openProof: vi.fn(),
}));

vi.mock("@/services/adminOrderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminOrderService")>();
  return {
    ...actual,
    getAdminOrderDetail: serviceMocks.getDetail,
    openAdminPaymentProof: serviceMocks.openProof,
  };
});

vi.mock("@/services/adminOrderHistoryService", () => ({
  getAdminOrderHistory: serviceMocks.getHistory,
}));

vi.mock("@/components/admin/OrderDocumentButtons", () => ({
  OrderDocumentButtons: () => <div>Order documents</div>,
}));

const summary: AdminOrder = {
  id: "order-1",
  orderNumber: "MPL-ORD-1001",
  ownerName: "Aina Owner",
  ownerEmail: "aina@example.com",
  ownerPhone: "+60123456789",
  petId: "pet-1",
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
  latestPaymentProofStatus: "PendingReview",
  paymentProofSubmittedAt: "2026-07-16T07:42:00Z",
  paymentMethod: "DuitNow",
  paymentReference: "PAY-1001",
  deliveryCity: "Kuala Lumpur",
  deliveryState: "Kuala Lumpur",
  createdAt: "2026-07-15T02:00:00Z",
  updatedAt: "2026-07-16T07:42:00Z",
};

const order: TagOrder = {
  id: summary.id,
  orderNumber: summary.orderNumber,
  petId: summary.petId,
  petName: summary.petName,
  tagType: "MyPetLink QR Pet Tag",
  variant: "Standard",
  delivery: {
    recipientName: "Aina Owner",
    phone: "+60123456789",
    addressLine1: "1 Jalan Ampang",
    addressLine2: "",
    postcode: "50450",
    city: "Kuala Lumpur",
    state: "Kuala Lumpur",
    notes: "Leave with reception",
  },
  estimatedPrice: "RM39",
  status: "Payment Confirmed",
  orderedDate: summary.createdAt,
  paymentSubmittedDate: summary.paymentProofSubmittedAt,
  paymentReference: summary.paymentReference,
  paymentProofs: [
    {
      id: "proof-1",
      status: "PendingReview",
      originalFileName: "receipt.jpg",
      paymentMethod: "DuitNow",
      paymentReference: "PAY-1001",
      submittedLabel: "16 Jul 2026",
    },
  ],
};

const backendOrder: BackendTagOrder = {
  id: summary.id,
  orderNumber: summary.orderNumber,
  ownerUserId: "owner-1",
  petId: summary.petId,
  petName: summary.petName,
  smartTagId: null,
  smartTagCode: null,
  tagType: "QrPetTag",
  variant: "Standard",
  amount: 39,
  currency: "MYR",
  deliveryFee: 8,
  status: "PaymentConfirmed",
  paymentStatus: "Confirmed",
  delivery: {
    recipientName: "Aina Owner",
    phoneE164: "+60123456789",
    addressLine1: "1 Jalan Ampang",
    addressLine2: null,
    postcode: "50450",
    city: "Kuala Lumpur",
    state: "Kuala Lumpur",
    notes: "Leave with reception",
  },
  paymentSubmittedAt: summary.paymentProofSubmittedAt,
  paymentConfirmedAt: null,
  paymentMethod: "DuitNow",
  paymentReference: "PAY-1001",
  paymentProofName: "receipt.jpg",
  trackingNumber: null,
  shippedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  paymentProofs: [
    {
      id: "proof-1",
      orderId: summary.id,
      mediaFileId: "media-1",
      originalFileName: "receipt.jpg",
      contentType: "image/jpeg",
      fileSize: 1024,
      storageProvider: "R2",
      paymentMethod: "DuitNow",
      status: "PendingReview",
      paymentReference: "PAY-1001",
      uploadedAt: "2026-07-16T07:42:00Z",
    },
  ],
  timeline: [],
  createdAt: summary.createdAt,
  updatedAt: summary.updatedAt,
};

const detail: AdminOrderDetail = {
  order,
  backendOrder,
  owner: { id: "owner-1", name: "Aina Owner", email: "aina@example.com" },
};

beforeEach(() => {
  serviceMocks.getDetail.mockResolvedValue(detail);
  serviceMocks.getHistory.mockResolvedValue([
    { id: "audit-1", action: "order.confirm-payment", actorType: "Admin", entityId: summary.id, createdAt: "2026-07-16T07:42:00Z" },
  ]);
  serviceMocks.openProof.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminOrderDetailDrawer", () => {
  it("shows separate payment and fulfilment state with readable dates", async () => {
    render(<AdminOrderDetailDrawer busy={false} onAction={vi.fn()} onClose={vi.fn()} refreshKey={0} summary={summary} />);

    await screen.findByText("Order summary");
    expect(screen.getByText("Payment: Confirmed")).toBeTruthy();
    expect(screen.getByText("Fulfilment: Not started")).toBeTruthy();
    expect(screen.queryByText("2026-07-16T07:42:00Z")).toBeNull();
    expect(screen.getAllByText("Payment confirmed").length).toBeGreaterThan(0);
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("offers only state-valid actions and passes the loaded order detail", async () => {
    const onAction = vi.fn();
    render(<AdminOrderDetailDrawer busy={false} onAction={onAction} onClose={vi.fn()} refreshKey={0} summary={summary} />);

    await screen.findByText("Available actions");
    expect(screen.getByRole("button", { name: "Assign inventory tag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark shipped" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Assign inventory tag" }));
    expect(onAction).toHaveBeenCalledWith("assign-tag", detail);
  });

  it("opens the protected payment proof and closes with Escape", async () => {
    const onClose = vi.fn();
    render(<AdminOrderDetailDrawer busy={false} onAction={vi.fn()} onClose={onClose} refreshKey={0} summary={summary} />);

    await screen.findByRole("button", { name: "Open payment proof" });
    fireEvent.click(screen.getByRole("button", { name: "Open payment proof" }));
    await waitFor(() => expect(serviceMocks.openProof).toHaveBeenCalledWith("proof-1"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
