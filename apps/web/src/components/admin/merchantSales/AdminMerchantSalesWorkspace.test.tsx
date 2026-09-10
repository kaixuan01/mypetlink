// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspaceState = vi.hoisted(() => ({ role: "Admin", search: "tab=overview" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams(workspaceState.search),
}));

vi.mock("@/services/authService", () => ({
  getAdminCapabilities: () => ({
    role: workspaceState.role,
    canManageSales: workspaceState.role === "Admin" || workspaceState.role === "SuperAdmin",
    canViewCommissionFinancials: workspaceState.role === "Admin" || workspaceState.role === "SuperAdmin",
    canManageCommissionRules: workspaceState.role === "SuperAdmin",
    canReverseCommission: workspaceState.role === "SuperAdmin",
    canMarkCommissionPaid: workspaceState.role === "SuperAdmin",
    canPreparePayout: workspaceState.role === "Admin" || workspaceState.role === "SuperAdmin",
  }),
}));

vi.mock("./MerchantSalesOverview", () => ({
  MerchantSalesOverview: () => <div data-testid="panel-overview" />,
}));
vi.mock("./SalesReportsPanel", () => ({ SalesReportsPanel: () => <div data-testid="panel-reports" /> }));
vi.mock("./QuotationsPanel", () => ({ QuotationsPanel: () => <div data-testid="panel-quotations" /> }));
vi.mock("./OrdersPanel", () => ({ OrdersPanel: () => <div data-testid="panel-orders" /> }));
vi.mock("./InvoicesPanel", () => ({ InvoicesPanel: () => <div data-testid="panel-invoices" /> }));
vi.mock("./MerchantsPanel", () => ({ MerchantsPanel: () => <div data-testid="panel-merchants" /> }));
vi.mock("./SalespersonsPanel", () => ({ SalespersonsPanel: () => <div data-testid="panel-salespersons" /> }));
vi.mock("./ReferralAttributionsPanel", () => ({ ReferralAttributionsPanel: () => <div data-testid="panel-referrals" /> }));
vi.mock("./CommissionsPanel", () => ({ CommissionsPanel: () => <div data-testid="panel-commissions" /> }));
vi.mock("./PayoutsPanel", () => ({
  PayoutsPanel: ({ openId }: { openId: string | null }) => (
    <div data-open-id={openId ?? ""} data-testid="panel-payouts" />
  ),
}));

const { AdminMerchantSalesWorkspace } = await import("./AdminMerchantSalesWorkspace");

beforeEach(() => {
  workspaceState.role = "Admin";
  workspaceState.search = "tab=overview";
});
afterEach(cleanup);

describe("AdminMerchantSalesWorkspace navigation", () => {
  it("gives Admin and Super Admin the complete grouped workspace", () => {
    for (const role of ["Admin", "SuperAdmin"]) {
      workspaceState.role = role;
      const view = render(<AdminMerchantSalesWorkspace />);
      const desktop = screen.getByTestId("workspace-nav-desktop");

      expect(within(desktop).getByText("Sales")).toBeTruthy();
      expect(within(desktop).getByText("Partners")).toBeTruthy();
      expect(within(desktop).getByText("Finance")).toBeTruthy();
      expect(within(desktop).getAllByRole("link")).toHaveLength(10);
      view.unmount();
    }
  });

  it("shows Operations Reports, Sales and Partners without Overview or Finance", () => {
    workspaceState.role = "Operations";
    workspaceState.search = "tab=reports";
    render(<AdminMerchantSalesWorkspace />);
    const desktop = screen.getByTestId("workspace-nav-desktop");

    expect(within(desktop).getByText("Reports")).toBeTruthy();
    expect(within(desktop).getByText("Sales")).toBeTruthy();
    expect(within(desktop).getByText("Partners")).toBeTruthy();
    expect(within(desktop).queryByText("Overview")).toBeNull();
    expect(within(desktop).queryByText("Finance")).toBeNull();
  });

  it("flattens Owner Support to the three sales records without a redundant heading", () => {
    workspaceState.role = "OwnerSupport";
    workspaceState.search = "tab=quotations";
    render(<AdminMerchantSalesWorkspace />);
    const desktop = screen.getByTestId("workspace-nav-desktop");

    expect(within(desktop).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Quotations",
      "Orders",
      "Invoices & Receipts",
    ]);
    expect(within(desktop).queryByText("Sales")).toBeNull();
  });

  it("restores every established tab value and record query from a direct URL", () => {
    const tabs = [
      "overview", "reports", "quotations", "orders", "invoices",
      "merchants", "salespersons", "referrals", "commissions", "payouts",
    ];

    for (const tab of tabs) {
      workspaceState.search = `tab=${tab}${tab === "payouts" ? "&open=payout-1" : ""}`;
      const view = render(<AdminMerchantSalesWorkspace />);
      expect(screen.getByTestId(`panel-${tab}`)).toBeTruthy();
      expect(screen.getByTestId(`workspace-nav-item-${tab}`).getAttribute("href")).toBe(
        `/admin/merchant-sales?tab=${tab}`
      );
      if (tab === "payouts") {
        expect(screen.getByTestId("panel-payouts").getAttribute("data-open-id")).toBe("payout-1");
      }
      view.unmount();
    }
  });
});
