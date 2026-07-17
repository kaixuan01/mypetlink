// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOrder, AdminOrderCounts } from "@/services/adminOrderService";
import { AdminOrdersManager } from "./AdminOrdersManager";

const mocks = vi.hoisted(() => ({
  listOrders: vi.fn(),
  countOrders: vi.fn(),
  setFilter: vi.fn(),
  setPage: vi.fn(),
  setPageSize: vi.fn(),
  setSearch: vi.fn(),
  setSort: vi.fn(),
  setFilters: vi.fn(),
  clearAllFilters: vi.fn(),
  setExtraParam: vi.fn(),
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/table/useAdminTableQuery")>();
  return {
    ...actual,
    useAdminTableQuery: () => ({
      query: {
        page: 2,
        pageSize: 20,
        search: "aina",
        sortBy: "createdAt",
        sortDir: "desc",
        filters: { paymentStatus: "Confirmed" },
      },
      hasActiveFilters: true,
      actions: {
        setFilter: mocks.setFilter,
        setFilters: mocks.setFilters,
        clearAllFilters: mocks.clearAllFilters,
        setPage: mocks.setPage,
        setPageSize: mocks.setPageSize,
        setSearch: mocks.setSearch,
        setSort: mocks.setSort,
        setExtraParam: mocks.setExtraParam,
        getExtraParam: () => null,
      },
    }),
  };
});

vi.mock("@/services/adminOrderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminOrderService")>();
  return {
    ...actual,
    listAdminOrders: mocks.listOrders,
    countAdminOrders: mocks.countOrders,
  };
});

vi.mock("@/components/admin/AdminOrderDetailDrawer", () => ({
  AdminOrderDetailDrawer: () => <div>Order detail drawer</div>,
}));

const row: AdminOrder = {
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
  deliveryCity: "Kuala Lumpur",
  deliveryState: "Kuala Lumpur",
  createdAt: "2026-07-15T02:00:00Z",
  updatedAt: "2026-07-16T07:42:00Z",
};

const counts: AdminOrderCounts = {
  all: 7,
  awaitingPayment: 1,
  paymentReview: 2,
  readyToPrepare: 1,
  preparing: 1,
  shipped: 1,
  delivered: 1,
  cancelled: 0,
};

beforeEach(() => {
  mocks.listOrders.mockResolvedValue({ items: [row], total: 7, page: 2, pageSize: 20 });
  mocks.countOrders.mockResolvedValue(counts);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminOrdersManager", () => {
  it("uses backend paging/counts and one URL-backed stage filter", async () => {
    render(<AdminOrdersManager />);

    await screen.findByText("MPL-ORD-1001");
    expect(mocks.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 20,
        search: "aina",
        paymentStatus: "Confirmed",
        sortBy: "createdAt",
        sortDir: "desc",
      }),
      expect.any(AbortSignal)
    );
    expect(mocks.countOrders).toHaveBeenCalledWith(expect.any(Object), expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "All 7" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Payment Review 2" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Payment Review 2" }));
    expect(mocks.setFilter).toHaveBeenCalledWith("stage", "payment-review");
  });

  it("renders the shared retry state without falling back to local rows", async () => {
    mocks.listOrders.mockRejectedValueOnce(new Error("offline"));
    render(<AdminOrdersManager />);

    await screen.findByText("We couldn't load tag orders. Please try again.");
    expect(screen.queryByText("MPL-ORD-1001")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(mocks.listOrders).toHaveBeenCalledTimes(2));
  });
});
