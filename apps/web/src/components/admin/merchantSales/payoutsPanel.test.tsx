// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommissionPayout } from "@/services/adminCommissionPayoutService";
import { commission, paged, salesperson } from "./merchantSalesFixtures";

const listCommissionPayouts = vi.fn();
const getCommissionPayout = vi.fn();
const prepareCommissionPayout = vi.fn();
const markCommissionPayoutPaid = vi.fn();
const cancelCommissionPayout = vi.fn();
const downloadCommissionPayoutStatement = vi.fn();
const listCommissions = vi.fn();
const listSalespersons = vi.fn();

vi.mock("@/services/adminCommissionPayoutService", async () => {
  const actual = await vi.importActual<typeof import("@/services/adminCommissionPayoutService")>("@/services/adminCommissionPayoutService");
  return {
    ...actual,
    listCommissionPayouts: (...args: unknown[]) => listCommissionPayouts(...args),
    getCommissionPayout: (...args: unknown[]) => getCommissionPayout(...args),
    prepareCommissionPayout: (...args: unknown[]) => prepareCommissionPayout(...args),
    markCommissionPayoutPaid: (...args: unknown[]) => markCommissionPayoutPaid(...args),
    cancelCommissionPayout: (...args: unknown[]) => cancelCommissionPayout(...args),
    downloadCommissionPayoutStatement: (...args: unknown[]) => downloadCommissionPayoutStatement(...args),
  };
});

vi.mock("@/services/adminMerchantBillingService", async () => {
  const actual = await vi.importActual<typeof import("@/services/adminMerchantBillingService")>("@/services/adminMerchantBillingService");
  return { ...actual, listCommissions: (...args: unknown[]) => listCommissions(...args) };
});

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<typeof import("@/services/adminMerchantSalesService")>("@/services/adminMerchantSalesService");
  return { ...actual, listSalespersons: (...args: unknown[]) => listSalespersons(...args) };
});

const { PayoutsPanel } = await import("./PayoutsPanel");

function payout(overrides: Partial<CommissionPayout["summary"]> = {}): CommissionPayout {
  const summary = {
    id: "payout-1",
    payoutNumber: "MPL-PAYOUT-260909-0001",
    salespersonId: "rep-1",
    salespersonCode: "MPL-SALES-001",
    salespersonName: "Nur Aisyah",
    periodFrom: "2026-09-01T00:00:00Z",
    periodToExclusive: "2026-10-01T00:00:00Z",
    currency: "MYR",
    preparedAmount: 18,
    status: "Prepared" as const,
    itemCount: 2,
    recoveryExposure: 0,
    preparedAt: "2026-09-09T04:00:00Z",
    paidAt: null,
    cancelledAt: null,
    paymentMethod: null,
    paymentReference: null,
    concurrencyToken: "payout-token",
    ...overrides,
  };
  return {
    summary,
    seller: {
      brandName: "MyPetLink",
      legalBusinessName: "GBB Software Solutions",
      businessRegistrationNumber: "AS0515813-P",
      taxIdentificationNumber: null,
      sstRegistrationNumber: null,
      addressLine1: "12 Jalan Teknologi",
      addressLine2: null,
      postcode: "57000",
      city: "Kuala Lumpur",
      state: "Kuala Lumpur",
      country: "Malaysia",
      supportEmail: "support@mypetlink.com.my",
    },
    preparedByAdminUserId: "admin-1",
    preparedBy: "Finance Admin",
    paidByAdminUserId: null,
    paidBy: null,
    paymentMethod: summary.paymentMethod,
    paymentReference: summary.paymentReference,
    notes: "September payout",
    cancelledByAdminUserId: null,
    cancelledBy: null,
    cancellationReason: null,
    items: [
      {
        id: "item-1",
        salesCommissionId: "commission-a",
        sourceType: "TagOrder",
        commissionType: "DirectRetailPercentage",
        merchantOrderId: null,
        tagOrderId: "tag-order-1",
        sourceOrderNumber: "MPL-ORD-A",
        commissionBaseAmount: 80,
        commissionAmount: 12,
        commissionPercentage: 15,
        commissionFixedAmount: null,
        currency: "MYR",
        calculatedAt: "2026-09-03T01:00:00Z",
        currentCommissionStatus: summary.status === "Paid" ? "Paid" : "Payable",
        reversedAt: null,
        reversalReason: null,
        releasedAt: null,
        releaseReason: null,
        requiresRecovery: false,
      },
      {
        id: "item-2",
        salesCommissionId: "commission-b",
        sourceType: "MerchantOrder",
        commissionType: "ResellerRepeatPercentage",
        merchantOrderId: "merchant-order-1",
        tagOrderId: null,
        sourceOrderNumber: "MPL-B2B-B",
        commissionBaseAmount: 200,
        commissionAmount: 6,
        commissionPercentage: 3,
        commissionFixedAmount: null,
        currency: "MYR",
        calculatedAt: "2026-09-04T01:00:00Z",
        currentCommissionStatus: summary.status === "Paid" ? "Paid" : "Payable",
        reversedAt: null,
        reversalReason: null,
        releasedAt: null,
        releaseReason: null,
        requiresRecovery: false,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-09T04:00:00Z"));
  listCommissionPayouts.mockResolvedValue(paged([payout().summary]));
  listSalespersons.mockResolvedValue(paged([salesperson()]));
  listCommissions.mockResolvedValue(paged([]));
  getCommissionPayout.mockResolvedValue(payout());
  prepareCommissionPayout.mockResolvedValue(payout());
  markCommissionPayoutPaid.mockResolvedValue(payout({ status: "Paid", paidAt: "2026-09-09T05:00:00Z", paymentMethod: "BankTransfer", paymentReference: "BANK-1" }));
  cancelCommissionPayout.mockResolvedValue(payout({ status: "Cancelled", cancelledAt: "2026-09-09T05:00:00Z" }));
  downloadCommissionPayoutStatement.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Payout operations", () => {
  it("loads the paginated list with payout filters and keeps the financial table scrollable", async () => {
    render(<PayoutsPanel canMarkPaid={false} canPrepare onOpen={() => {}} openId={null} />);

    expect(await screen.findByText("MPL-PAYOUT-260909-0001")).toBeTruthy();
    expect(listCommissionPayouts).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25 }), expect.any(AbortSignal));
    const table = screen.getByText("MPL-PAYOUT-260909-0001").closest("table")!;
    expect(table.parentElement?.className).toContain("overflow-x-auto");

    fireEvent.change(screen.getByLabelText("Payout number"), { target: { value: "260909" } });
    fireEvent.change(screen.getByLabelText("Salesperson"), { target: { value: "rep-1" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Paid" } });
    fireEvent.change(screen.getByLabelText("Period from"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Period through"), { target: { value: "2026-08-31" } });
    await waitFor(() => expect(listCommissionPayouts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        salespersonId: "rep-1",
        status: "Paid",
        payoutNumber: "260909",
        from: new Date("2026-08-01T00:00:00").toISOString(),
        toExclusive: new Date("2026-09-01T00:00:00").toISOString(),
      }),
      expect.any(AbortSignal)
    ));
  });

  it("loads only PayableAndUnclaimed rows and submits the exact sorted selection", async () => {
    listCommissions.mockResolvedValue(paged([
      commission({ id: "commission-z", commissionAmount: 12, sourceOrderNumber: "ORDER-Z" }),
      commission({ id: "commission-a", commissionAmount: 6, sourceOrderNumber: "ORDER-A", commissionType: "ResellerRepeatPercentage" }),
    ]));
    render(<PayoutsPanel canMarkPaid={false} canPrepare onOpen={() => {}} openId={null} />);
    await screen.findByText("MPL-PAYOUT-260909-0001");
    fireEvent.click(screen.getByRole("button", { name: "Prepare payout" }));
    fireEvent.change(screen.getAllByLabelText("Salesperson")[0], { target: { value: "rep-1" } });

    await waitFor(() => expect(listCommissions).toHaveBeenCalledWith(expect.objectContaining({ salespersonId: "rep-1", payableAndUnclaimed: true }), expect.any(AbortSignal)));
    fireEvent.click(await screen.findByLabelText("Select all commissions on this page"));
    expect(screen.getAllByText("MYR 18.00").length).toBeGreaterThan(0);
    const prepareSection = screen.getByRole("heading", { name: "Prepare commission payout" }).closest("section")!;
    fireEvent.click(within(prepareSection).getByRole("button", { name: "Prepare payout" }));

    await waitFor(() => expect(prepareCommissionPayout).toHaveBeenCalledWith(expect.objectContaining({
      salesCommissionIds: ["commission-a", "commission-z"],
      salespersonId: "rep-1",
      expectedTotal: 18,
      idempotencyKey: expect.stringMatching(/^payout-ui-/),
    })));
  });

  it("lets Admin cancel with row version but never mark paid", async () => {
    render(<PayoutsPanel canMarkPaid={false} canPrepare onOpen={() => {}} openId="payout-1" />);
    expect((await screen.findAllByText("Prepared — Not Yet Paid")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Mark paid" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel payout" }));
    fireEvent.change(screen.getByLabelText("Cancellation reason"), { target: { value: "Wrong period" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel payout" }).at(-1)!);

    await waitFor(() => expect(cancelCommissionPayout).toHaveBeenCalledWith("payout-1", "payout-token", "Wrong period"));
  });

  it("requires SuperAdmin payment details and records the external payment deliberately", async () => {
    render(<PayoutsPanel canMarkPaid canPrepare onOpen={() => {}} openId="payout-1" />);
    expect((await screen.findAllByText("Prepared — Not Yet Paid")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    const dialog = screen.getByRole("dialog", { name: "Record payout as paid?" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm real payment" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(dialog.textContent).toMatch(/external real-world payment/i);
    fireEvent.change(within(dialog).getByLabelText("Payment reference"), { target: { value: "BANK-REAL-1" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(markCommissionPayoutPaid).toHaveBeenCalledWith("payout-1", {
      concurrencyToken: "payout-token",
      paymentMethod: "BankTransfer",
      paymentReference: "BANK-REAL-1",
    }));
  });

  it("keeps paid amount intact and displays recovery exposure separately", async () => {
    const paid = payout({ status: "Paid", paidAt: "2026-09-09T05:00:00Z", paymentMethod: "BankTransfer", paymentReference: "BANK-1", recoveryExposure: 6 });
    paid.paymentMethod = "BankTransfer";
    paid.paymentReference = "BANK-1";
    paid.items[1] = { ...paid.items[1], currentCommissionStatus: "Reversed", requiresRecovery: true, reversedAt: "2026-09-10T05:00:00Z", reversalReason: "Refunded" };
    getCommissionPayout.mockResolvedValue(paid);
    render(<PayoutsPanel canMarkPaid canPrepare onOpen={() => {}} openId="payout-1" />);

    expect(await screen.findByText("Recovery required: MYR 6.00")).toBeTruthy();
    expect(screen.getByText(/Paid amount remains MYR 18.00/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark paid" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel payout" })).toBeNull();
  });
});
