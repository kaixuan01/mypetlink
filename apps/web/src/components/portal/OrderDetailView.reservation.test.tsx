// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagOrder } from "@/types";

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({ getPets: vi.fn(async () => ({ data: [] })) }));
vi.mock("@/components/portal/ManualPaymentPanel", () => ({
  ManualPaymentPanel: () => <div>Payment proof form</div>,
}));

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getAllTags: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/services/tagService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagService")>();
  return {
    ...actual,
    getOrder: mocks.getOrder,
    getAllTags: mocks.getAllTags,
    cancelOwnerOrder: mocks.cancel,
  };
});

const { OrderDetailView } = await import("./OrderDetailView");

function order(overrides: Partial<TagOrder> = {}): TagOrder {
  return {
    id: "order-1",
    orderNumber: "MPL-ORD-1",
    petId: "pet-1",
    tagType: "MyPetLink QR Pet Tag",
    variant: "Standard",
    delivery: { recipientName: "Aina", phone: "+60123456789", addressLine1: "1 Jalan Pet", addressLine2: "", postcode: "50000", city: "Kuala Lumpur", state: "Kuala Lumpur", notes: "" },
    estimatedPrice: "RM29.90",
    status: "Pending Payment",
    orderedDate: "2026-08-03",
    paymentMethod: "QR Payment",
    canCancel: true,
    ...overrides,
  } as TagOrder;
}

beforeEach(() => {
  mocks.getOrder.mockReset();
  mocks.getAllTags.mockReset().mockResolvedValue({ data: [] });
  mocks.cancel.mockReset();
});
afterEach(cleanup);

describe("OrderDetailView reservation actions", () => {
  it("confirms cancellation, prevents repeat submission and refreshes the terminal state", async () => {
    const active = order();
    const cancelled = order({ status: "Cancelled", canCancel: false, trackingStatus: "Order cancelled at your request." });
    mocks.getOrder.mockResolvedValue({ data: active });
    let resolveCancel!: (value: unknown) => void;
    mocks.cancel.mockReturnValue(new Promise((resolve) => { resolveCancel = resolve; }));
    render(<OrderDetailView initialOrder={active} initialTags={[]} orderKey={active.orderNumber!} pets={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel order" });
    expect(within(dialog).getByText("Cancel this unpaid order? The reserved tags will be released and this order cannot be resumed.")).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: "Cancel order" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect((within(dialog).getByRole("button", { name: "Working…" }) as HTMLButtonElement).disabled).toBe(true);

    resolveCancel({ data: { order: cancelled } });
    expect(await screen.findByText("This unpaid order was cancelled. Reserved inventory has been released.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a new order" }).getAttribute("href")).toBe("/tags/order");
    expect(screen.queryByText("Payment proof form")).toBeNull();
    expect(mocks.getAllTags).toHaveBeenCalledTimes(2);
  });

  it("shows the server-confirmed expired state and hides payment", async () => {
    const expired = order({ status: "Cancelled", canCancel: false, paymentReservationExpiredAt: "2026-08-03T14:00:00Z" });
    mocks.getOrder.mockResolvedValue({ data: expired });
    render(<OrderDetailView initialOrder={expired} initialTags={[]} orderKey={expired.orderNumber!} pets={[]} />);
    expect(await screen.findByText("This order expired because payment was not completed in time. The reserved tags have been released.")).toBeTruthy();
    expect(screen.queryByText("Payment proof form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    expect(screen.getByRole("link", { name: "Start a new order" })).toBeTruthy();
  });

  it.each(["Payment Submitted", "Payment Confirmed", "Shipped", "Delivered"] as const)(
    "does not offer owner cancellation in %s",
    async (status) => {
      const current = order({ status, canCancel: false });
      mocks.getOrder.mockResolvedValue({ data: current });
      render(<OrderDetailView initialOrder={current} initialTags={[]} orderKey={current.orderNumber!} pets={[]} />);
      await waitFor(() => expect(mocks.getOrder).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    }
  );
});
