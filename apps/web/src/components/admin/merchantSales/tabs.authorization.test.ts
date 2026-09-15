import { describe, expect, it } from "vitest";
import { merchantSalesTabs, merchantSalesTabsFor } from "./tabs";
import {
  adminCapabilities,
  allAdminCapabilities,
  noAdminAccess,
  type AdminAccessCapabilities,
  type AdminCapabilityKey,
} from "@/lib/adminCapabilities";

function accessWith(...capabilities: AdminCapabilityKey[]): AdminAccessCapabilities {
  return { isSuperAdmin: false, roles: [], granted: new Set(capabilities) };
}

describe("Merchant Sales sections", () => {
  it("shows every section to somebody with every permission", () => {
    expect(merchantSalesTabsFor(allAdminCapabilities())).toHaveLength(10);
  });

  it("shows nothing to somebody with no merchant sales permissions", () => {
    expect(merchantSalesTabsFor(noAdminAccess)).toEqual([]);
    expect(merchantSalesTabsFor(accessWith(adminCapabilities.ordersView))).toEqual([]);
  });

  it("keeps commission and payout sections away from an operator who cannot see them", () => {
    const ids = merchantSalesTabsFor(
      accessWith(
        adminCapabilities.salesView,
        adminCapabilities.merchantOrdersView,
        adminCapabilities.merchantInvoicesView
      )
    ).map((tab) => tab.id);

    expect(ids).toContain("reports");
    expect(ids).toContain("merchants");
    expect(ids).toContain("quotations");
    expect(ids).not.toContain("overview");
    expect(ids).not.toContain("commissions");
    expect(ids).not.toContain("payouts");
  });

  it("gives a finance operator commissions and payouts without partner management", () => {
    const ids = merchantSalesTabsFor(
      accessWith(adminCapabilities.salesCommissionsView, adminCapabilities.payoutsView)
    ).map((tab) => tab.id);

    expect(ids).toContain("overview");
    expect(ids).toContain("commissions");
    expect(ids).toContain("payouts");
    expect(ids).not.toContain("merchants");
    expect(ids).not.toContain("quotations");
  });

  it("names a permission for every section, so none is reachable by default", () => {
    expect(merchantSalesTabs.every((tab) => Boolean(tab.capability))).toBe(true);
  });
});
