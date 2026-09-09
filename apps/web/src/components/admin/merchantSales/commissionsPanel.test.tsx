// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCommissionRule } from "@/services/adminMerchantBillingService";
import { commission, paged, salesperson } from "./merchantSalesFixtures";

const listCommissions = vi.fn();
const listCommissionRules = vi.fn();
const listSalespersons = vi.fn();
const listMerchants = vi.fn();
const reverseCommission = vi.fn();

vi.mock("@/services/adminMerchantBillingService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantBillingService")
  >("@/services/adminMerchantBillingService");
  return {
    ...actual,
    listCommissions: (...args: unknown[]) => listCommissions(...args),
    listCommissionRules: (...args: unknown[]) => listCommissionRules(...args),
    listSalespersons: (...args: unknown[]) => listSalespersons(...args),
    listMerchants: (...args: unknown[]) => listMerchants(...args),
    reverseCommission: (...args: unknown[]) => reverseCommission(...args),
  };
});

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return {
    ...actual,
    listSalespersons: (...args: unknown[]) => listSalespersons(...args),
    listMerchants: (...args: unknown[]) => listMerchants(...args),
  };
});

const { CommissionsPanel } = await import("./CommissionsPanel");

const rule: AdminCommissionRule = {
  id: "rule-1",
  commissionType: "DirectRetailPercentage",
  salespersonId: null,
  salespersonCode: null,
  salespersonName: null,
  percentage: 15,
  fixedAmount: null,
  minQuantity: null,
  maxQuantity: null,
  eligibilityMonths: null,
  currency: "MYR",
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveTo: null,
  isActive: true,
  notes: "Default direct retail commission",
  updatedByAdminUserId: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  concurrencyToken: "rule-token",
};

beforeEach(() => {
  vi.clearAllMocks();
  listCommissions.mockResolvedValue(
    paged([
      commission(),
      commission({
        id: "commission-retail",
        sourceType: "TagOrder",
        commissionType: "DirectRetailPercentage",
        merchantOrderId: null,
        merchantPaymentId: null,
        tagOrderId: "tag-order-1",
        sourceOrderNumber: "MPL-ORD-260908000001-1001",
        commissionPercentage: 15,
        commissionBaseAmount: 89.7,
        commissionAmount: 13.46,
        commissionRuleId: "rule-1",
        commissionRuleEffectiveFrom: "2026-01-01T00:00:00Z",
      }),
    ])
  );
  listCommissionRules.mockResolvedValue(paged([rule]));
  listSalespersons.mockResolvedValue(paged([salesperson()]));
  listMerchants.mockResolvedValue(paged([]));
});

afterEach(cleanup);

describe("Commission ledger", () => {
  it("distinguishes channels and shows the snapshotted direct calculation", async () => {
    render(<CommissionsPanel />);

    expect(await screen.findByText("Merchant order percentage")).toBeTruthy();
    const retailType = screen.getByText("Direct retail percentage");
    const retailRow = retailType.closest("tr") as HTMLElement;
    expect(within(retailRow).getByText("Direct retail")).toBeTruthy();
    expect(within(retailRow).getByText("MYR 89.70 base")).toBeTruthy();
    expect(within(retailRow).getByText("MYR 13.46")).toBeTruthy();
    expect(within(retailRow).getByText(/Rule rule-1/)).toBeTruthy();
  });

  it("directs payable rows into payout batching and removes individual payment", async () => {
    render(<CommissionsPanel />);
    expect((await screen.findAllByText("Payable / Unclaimed")).length).toBeGreaterThan(0);

    expect(screen.queryByRole("button", { name: /mark paid/i })).toBeNull();
    expect(screen.getByText(/settled through payout batches/i)).toBeTruthy();
  });

  it("labels and links payout claims from the server projection", async () => {
    const onOpenPayout = vi.fn();
    listCommissions.mockResolvedValue(paged([commission({
      payoutClaimState: "ReservedInPreparedPayout",
      payoutId: "payout-1",
      payoutNumber: "MPL-PAYOUT-260909-0001",
    })]));
    render(<CommissionsPanel onOpenPayout={onOpenPayout} />);

    expect(await screen.findByText("Reserved in Prepared payout")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View MPL-PAYOUT-260909-0001" }));
    expect(onOpenPayout).toHaveBeenCalledWith("payout-1");
  });

  it("states rule precedence and keeps the seeded global rule visible", async () => {
    render(<CommissionsPanel />);

    expect(await screen.findByText(/salesperson-specific rule takes precedence/i)).toBeTruthy();
    expect(screen.getByText(/All salespersons · Direct retail percentage · 15%/)).toBeTruthy();
    expect(screen.getByText("Default direct retail commission")).toBeTruthy();
  });

  it("pages through commission history instead of hiding records after the first page", async () => {
    listCommissions.mockResolvedValue(paged([commission()], 75));
    render(<CommissionsPanel />);
    await screen.findByText("Showing 1–50 of 75");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(listCommissions).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 50 }),
        expect.any(AbortSignal)
      )
    );
    expect(await screen.findByText("Showing 51–75 of 75")).toBeTruthy();
  });

  it("hides payout, reversal and rule controls for a financial read-only admin", async () => {
    render(<CommissionsPanel canManageRules={false} canReverse={false} />);

    await screen.findByText("Merchant order percentage");
    expect(screen.queryByRole("button", { name: "Mark paid" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reverse" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New rule" })).toBeNull();
    expect(listCommissionRules).not.toHaveBeenCalled();
  });
});
