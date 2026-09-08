// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCommissionRule } from "@/services/adminMerchantBillingService";
import { commission, paged, salesperson } from "./merchantSalesFixtures";

const listCommissions = vi.fn();
const listCommissionRules = vi.fn();
const listSalespersons = vi.fn();
const markCommissionPaid = vi.fn();
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
    markCommissionPaid: (...args: unknown[]) => markCommissionPaid(...args),
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
  markCommissionPaid.mockResolvedValue(
    commission({ status: "Paid", paidAt: "2026-09-08T01:00:00Z" })
  );
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

  it("pays only the selected payable ledger row with its concurrency token", async () => {
    render(<CommissionsPanel />);
    await screen.findByText("Merchant order percentage");

    fireEvent.click(screen.getAllByRole("button", { name: "Mark paid" })[0]);

    await waitFor(() =>
      expect(markCommissionPaid).toHaveBeenCalledWith(
        "commission-1",
        "token-commission-1"
      )
    );
  });

  it("states rule precedence and keeps the seeded global rule visible", async () => {
    render(<CommissionsPanel />);

    expect(await screen.findByText(/salesperson-specific rule takes precedence/i)).toBeTruthy();
    expect(screen.getByText(/All salespersons · 15%/)).toBeTruthy();
    expect(screen.getByText("Default direct retail commission")).toBeTruthy();
  });

  it("pages through commission history instead of hiding records after the first page", async () => {
    listCommissions.mockResolvedValue(paged([commission()], 75));
    render(<CommissionsPanel />);
    await screen.findByText("Showing 1–50 of 75");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(listCommissions).toHaveBeenCalledWith(
        { page: 2, pageSize: 50 },
        expect.any(AbortSignal)
      )
    );
    expect(await screen.findByText("Showing 51–75 of 75")).toBeTruthy();
  });
});
