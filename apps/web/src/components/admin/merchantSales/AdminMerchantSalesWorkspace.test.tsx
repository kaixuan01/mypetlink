// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCapabilities, allAdminCapabilities } from "@/lib/adminCapabilities";

const workspaceState = vi.hoisted(() => ({
  access: {
    isSuperAdmin: true,
    roles: [] as unknown[],
    granted: new Set<string>(),
  },
  search: "tab=overview",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams(workspaceState.search),
}));

vi.mock("@/services/authService", () => ({
  getAdminCapabilities: () => workspaceState.access,
}));

vi.mock("./MerchantSalesOverview", () => ({
  MerchantSalesOverview: () => <div data-testid="panel-overview" />,
}));
vi.mock("./SalesReportsPanel", () => ({
  SalesReportsPanel: ({ canViewFinancial }: { canViewFinancial: boolean }) => (
    <div data-can-view-financial={String(canViewFinancial)} data-testid="panel-reports" />
  ),
}));
vi.mock("./QuotationsPanel", () => ({
  QuotationsPanel: ({ editing }: { editing: boolean }) => (
    <div data-editing={String(editing)} data-testid="panel-quotations" />
  ),
}));
vi.mock("./OrdersPanel", () => ({ OrdersPanel: () => <div data-testid="panel-orders" /> }));
vi.mock("./InvoicesPanel", () => ({
  InvoicesPanel: ({ canRecordPayment }: { canRecordPayment: boolean }) => (
    <div data-can-record-payment={String(canRecordPayment)} data-testid="panel-invoices" />
  ),
}));
vi.mock("./MerchantsPanel", () => ({
  MerchantsPanel: ({ canManage }: { canManage: boolean }) => (
    <div data-can-manage={String(canManage)} data-testid="panel-merchants" />
  ),
}));
vi.mock("./SalespersonsPanel", () => ({
  SalespersonsPanel: () => <div data-testid="panel-salespersons" />,
}));
vi.mock("./ReferralAttributionsPanel", () => ({
  ReferralAttributionsPanel: ({ canManage }: { canManage: boolean }) => (
    <div data-can-manage={String(canManage)} data-testid="panel-referrals" />
  ),
}));
vi.mock("./CommissionsPanel", () => ({
  CommissionsPanel: ({
    canManageRules,
    canReverse,
  }: {
    canManageRules: boolean;
    canReverse: boolean;
  }) => (
    <div
      data-can-manage-rules={String(canManageRules)}
      data-can-reverse={String(canReverse)}
      data-testid="panel-commissions"
    />
  ),
}));
vi.mock("./PayoutsPanel", () => ({
  PayoutsPanel: ({
    canMarkPaid,
    canPrepare,
    openId,
  }: {
    canMarkPaid: boolean;
    canPrepare: boolean;
    openId: string | null;
  }) => (
    <div
      data-can-mark-paid={String(canMarkPaid)}
      data-can-prepare={String(canPrepare)}
      data-open-id={openId ?? ""}
      data-testid="panel-payouts"
    />
  ),
}));

const { AdminMerchantSalesWorkspace } = await import("./AdminMerchantSalesWorkspace");

function grant(...capabilities: string[]) {
  Object.assign(workspaceState.access, {
    isSuperAdmin: false,
    roles: [],
    granted: new Set(capabilities),
  });
}

beforeEach(() => {
  Object.assign(workspaceState.access, allAdminCapabilities());
  workspaceState.search = "tab=overview";
});
afterEach(cleanup);

describe("AdminMerchantSalesWorkspace navigation", () => {
  it("gives somebody with every permission the complete grouped workspace", () => {
    render(<AdminMerchantSalesWorkspace />);
    const desktop = screen.getByTestId("workspace-nav-desktop");

    expect(within(desktop).getByText("Sales")).toBeTruthy();
    expect(within(desktop).getByText("Partners")).toBeTruthy();
    expect(within(desktop).getByText("Finance")).toBeTruthy();
    expect(within(desktop).getAllByRole("link")).toHaveLength(10);
  });

  it("shows an operations operator Reports, Sales and Partners without Finance", () => {
    grant(
      adminCapabilities.salesView,
      adminCapabilities.merchantOrdersView,
      adminCapabilities.merchantInvoicesView
    );
    workspaceState.search = "tab=reports";
    render(<AdminMerchantSalesWorkspace />);
    const desktop = screen.getByTestId("workspace-nav-desktop");

    expect(within(desktop).getByText("Reports")).toBeTruthy();
    expect(within(desktop).getByText("Partners")).toBeTruthy();
    expect(within(desktop).queryByText("Overview")).toBeNull();
    expect(within(desktop).queryByText("Commissions")).toBeNull();
    expect(within(desktop).queryByText("Payouts")).toBeNull();
  });

  it("flattens a quotations-only operator to the sales records", () => {
    grant(adminCapabilities.merchantOrdersView, adminCapabilities.merchantInvoicesView);
    workspaceState.search = "tab=quotations";
    render(<AdminMerchantSalesWorkspace />);
    const desktop = screen.getByTestId("workspace-nav-desktop");

    expect(within(desktop).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Quotations",
      "Orders",
      "Invoices & Receipts",
    ]);
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

  it("sends somebody who asks for a section they cannot open to one they can", () => {
    grant(adminCapabilities.merchantOrdersView);
    workspaceState.search = "tab=payouts";
    render(<AdminMerchantSalesWorkspace />);

    expect(screen.queryByTestId("panel-payouts")).toBeNull();
    expect(screen.getByTestId("panel-quotations")).toBeTruthy();
  });

  it("explains itself when no section is available at all", () => {
    grant(adminCapabilities.ordersView);
    render(<AdminMerchantSalesWorkspace />);

    expect(screen.queryByTestId("workspace-nav-desktop")).toBeNull();
    expect(screen.getByText("Merchant Sales")).toBeTruthy();
    expect(screen.getByText(/do not have permission to open any part/i)).toBeTruthy();
  });
});

describe("AdminMerchantSalesWorkspace action visibility", () => {
  it("gives a read-only operator the view without any change controls", () => {
    grant(
      adminCapabilities.salesView,
      adminCapabilities.merchantOrdersView,
      adminCapabilities.merchantInvoicesView,
      adminCapabilities.salesCommissionsView,
      adminCapabilities.payoutsView
    );

    workspaceState.search = "tab=merchants";
    const merchants = render(<AdminMerchantSalesWorkspace />);
    expect(screen.getByTestId("panel-merchants").getAttribute("data-can-manage")).toBe("false");
    merchants.unmount();

    workspaceState.search = "tab=referrals";
    const referrals = render(<AdminMerchantSalesWorkspace />);
    expect(screen.getByTestId("panel-referrals").getAttribute("data-can-manage")).toBe("false");
    referrals.unmount();

    workspaceState.search = "tab=invoices";
    const invoices = render(<AdminMerchantSalesWorkspace />);
    expect(screen.getByTestId("panel-invoices").getAttribute("data-can-record-payment")).toBe(
      "false"
    );
    invoices.unmount();

    workspaceState.search = "tab=commissions";
    const commissions = render(<AdminMerchantSalesWorkspace />);
    const panel = screen.getByTestId("panel-commissions");
    expect(panel.getAttribute("data-can-manage-rules")).toBe("false");
    expect(panel.getAttribute("data-can-reverse")).toBe("false");
    commissions.unmount();

    workspaceState.search = "tab=payouts";
    render(<AdminMerchantSalesWorkspace />);
    const payouts = screen.getByTestId("panel-payouts");
    expect(payouts.getAttribute("data-can-prepare")).toBe("false");
    expect(payouts.getAttribute("data-can-mark-paid")).toBe("false");
  });

  it("separates preparing a payout from releasing one", () => {
    grant(adminCapabilities.payoutsView, adminCapabilities.payoutsManage);
    workspaceState.search = "tab=payouts";
    render(<AdminMerchantSalesWorkspace />);

    const payouts = screen.getByTestId("panel-payouts");
    expect(payouts.getAttribute("data-can-prepare")).toBe("true");
    expect(payouts.getAttribute("data-can-mark-paid")).toBe("false");
  });

  it("separates recording an invoice payment from reading commission figures", () => {
    grant(adminCapabilities.merchantInvoicesView, adminCapabilities.salesCommissionsView);
    workspaceState.search = "tab=invoices";
    render(<AdminMerchantSalesWorkspace />);

    expect(screen.getByTestId("panel-invoices").getAttribute("data-can-record-payment")).toBe(
      "false"
    );

    cleanup();
    grant(
      adminCapabilities.merchantInvoicesView,
      adminCapabilities.merchantInvoicesRecordPayment
    );
    render(<AdminMerchantSalesWorkspace />);
    expect(screen.getByTestId("panel-invoices").getAttribute("data-can-record-payment")).toBe(
      "true"
    );
  });

  it("does not offer quotation editing without permission to manage them", () => {
    grant(adminCapabilities.merchantOrdersView);
    workspaceState.search = "tab=quotations&edit=new";
    render(<AdminMerchantSalesWorkspace />);

    expect(screen.getByTestId("panel-quotations").getAttribute("data-editing")).toBe("false");

    cleanup();
    grant(adminCapabilities.merchantOrdersView, adminCapabilities.merchantOrdersManage);
    render(<AdminMerchantSalesWorkspace />);
    expect(screen.getByTestId("panel-quotations").getAttribute("data-editing")).toBe("true");
  });
});
