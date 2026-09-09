import { describe, expect, it } from "vitest";
import { merchantSalesTabsForRole } from "./tabs";

describe("Merchant Sales role-sensitive tabs", () => {
  it("keeps Owner Support away from reports, relationships and commissions", () => {
    expect(merchantSalesTabsForRole("OwnerSupport").map((tab) => tab.id)).toEqual([
      "quotations", "orders", "invoices",
    ]);
  });

  it("allows Operations performance without financial commission screens", () => {
    const ids = merchantSalesTabsForRole("Operations").map((tab) => tab.id);
    expect(ids).toContain("reports");
    expect(ids).toContain("merchants");
    expect(ids).not.toContain("overview");
    expect(ids).not.toContain("commissions");
    expect(ids).not.toContain("payouts");
  });

  it("allows Admin and SuperAdmin to see the financial tabs", () => {
    for (const role of ["Admin", "SuperAdmin"]) {
      const ids = merchantSalesTabsForRole(role).map((tab) => tab.id);
      expect(ids).toContain("reports");
      expect(ids).toContain("commissions");
      expect(ids).toContain("payouts");
    }
  });
});
