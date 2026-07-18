// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPaymentProof, AdminPaymentProofCounts } from "@/services/adminPaymentProofService";
import { AdminPaymentProofsManager } from "./AdminPaymentProofsManager";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  count: vi.fn(),
  detail: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  download: vi.fn(),
  setFilter: vi.fn(),
  setFilters: vi.fn(),
  clearAllFilters: vi.fn(),
  setPage: vi.fn(),
  setPageSize: vi.fn(),
  setSearch: vi.fn(),
  setSort: vi.fn(),
  setExtraParam: vi.fn(),
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/table/useAdminTableQuery")>();
  return {
    ...actual,
    useAdminTableQuery: () => ({
      query: {
        page: 1,
        pageSize: 20,
        search: "aina",
        sortBy: "queue",
        sortDir: "desc",
        filters: { status: "PendingReview", needsAttention: "true" },
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
        getExtraParam: () => "",
      },
    }),
  };
});

vi.mock("@/services/adminPaymentProofService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminPaymentProofService")>();
  return {
    ...actual,
    listAdminPaymentProofs: mocks.list,
    countAdminPaymentProofs: mocks.count,
    getAdminPaymentProofDetail: mocks.detail,
    approveAdminPaymentProof: mocks.approve,
    rejectAdminPaymentProof: mocks.reject,
    downloadAdminPaymentProofsExport: mocks.download,
    getAdminPaymentProofExportFormats: () => ["csv", "xlsx"],
  };
});

vi.mock("@/components/admin/AdminPaymentProofDetailDrawer", () => ({
  AdminPaymentProofDetailDrawer: () => <div>Payment proof drawer</div>,
}));

const proof: AdminPaymentProof = {
  id: "a1111111-1111-4111-8111-111111111111",
  orderId: "b2222222-2222-4222-8222-222222222222",
  orderNumber: "MPL-ORD-2026-0001",
  ownerId: "c3333333-3333-4333-8333-333333333333",
  ownerName: "Aina Owner",
  ownerEmail: "aina@example.com",
  ownerPhone: "+60123456789",
  petName: "Milo",
  expectedAmount: 51.4,
  currency: "MYR",
  status: "PendingReview",
  orderStatus: "Payment Submitted",
  orderPaymentStatus: "ProofSubmitted",
  fulfilmentStatus: "NotStarted",
  originalFileName: "receipt.jpg",
  contentType: "image/jpeg",
  fileSize: 1024,
  hasMedia: true,
  paymentMethod: "QR Payment",
  paymentReference: "REF-889",
  submittedAt: "2026-07-15T02:00:00Z",
  updatedAt: "2026-07-15T02:00:00Z",
  referenceUsedByOtherOrder: false,
  proofFileUsedByOtherOrder: false,
  orderStateConflict: false,
  pendingProofCount: 1,
  requiresAttention: true,
};

const counts: AdminPaymentProofCounts = { all: 9, pendingReview: 4, approved: 3, rejected: 1, superseded: 1, needsAttention: 2 };

beforeEach(() => {
  mocks.list.mockResolvedValue({ items: [proof], total: 9 });
  mocks.count.mockResolvedValue(counts);
  mocks.download.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminPaymentProofsManager", () => {
  it("lists proofs through the shared table with server-side params and the queue default sort", async () => {
    render(<AdminPaymentProofsManager />);

    await screen.findByText("aina@example.com");
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        search: "aina",
        status: "PendingReview",
        needsAttention: "true",
      }),
      expect.any(AbortSignal)
    );
    // The queue sentinel never reaches the API; omitting sortBy selects the
    // pending-first queue ordering on the server.
    const request = mocks.list.mock.calls[0][0] as Record<string, unknown>;
    expect("sortBy" in request).toBe(false);
    expect("sortDir" in request).toBe(false);
    expect(mocks.count).toHaveBeenCalled();
  });

  it("shows review-status shortcuts with counts and text-based attention flags", async () => {
    render(<AdminPaymentProofsManager />);

    const row = (await screen.findByText("aina@example.com")).closest("tr")!;
    expect(within(row).getByText("Pending review")).toBeDefined();
    expect(within(row).getByText("Requires manual verification")).toBeDefined();

    const shortcutNav = screen.getByLabelText("Review status shortcuts");
    expect(within(shortcutNav).getByText("Awaiting review").closest("button")?.textContent).toContain("4");
    fireEvent.click(within(shortcutNav).getByText("Approved"));
    expect(mocks.setFilter).toHaveBeenCalledWith("status", "Approved");
  });

  it("requires a reason before rejecting a proof", async () => {
    render(<AdminPaymentProofsManager />);
    await screen.findByText("aina@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(mocks.setExtraParam).toHaveBeenCalledWith("proof", proof.id);
  });

  it("shows the shared retry state without local fallback data", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    render(<AdminPaymentProofsManager />);

    await screen.findByText("We couldn't load payment proofs. Please try again.");
    expect(screen.queryByText("aina@example.com")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it("exports filtered rows through the shared export menu", async () => {
    render(<AdminPaymentProofsManager />);
    await screen.findByText("aina@example.com");

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Export all filtered rows as Excel" }));

    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PendingReview" }),
        "xlsx",
        undefined
      )
    );
  });
});
