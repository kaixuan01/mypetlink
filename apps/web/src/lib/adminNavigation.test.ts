import { describe, expect, it } from "vitest";
import {
  activeAdminNavGroupId,
  activeAdminNavLabel,
  adminNavGroups,
  isAdminNavGroupOpen,
  isAdminNavItemActive,
  visibleAdminNavGroups,
} from "./adminNavigation";
import type {
  AdminCapabilities,
  AdminOperationalRole,
} from "@/services/authService";

function capabilitiesFor(role: AdminOperationalRole): AdminCapabilities {
  return {
    role,
    canViewSalesPerformance: role !== "OwnerSupport",
    canManageSales: role === "Admin" || role === "SuperAdmin",
    canViewCommissionFinancials: role === "Admin" || role === "SuperAdmin",
    canPreparePayout: role === "Admin" || role === "SuperAdmin",
    canMarkCommissionPaid: role === "SuperAdmin",
    canReverseCommission: role === "SuperAdmin",
    canManageCommissionRules: role === "SuperAdmin",
  };
}

const superAdminCapabilities = capabilitiesFor("SuperAdmin");

describe("adminNavigation", () => {
  it("defines the approved groups in order", () => {
    const labels = adminNavGroups.map((group) => group.label);
    expect(labels).toEqual([
      null,
      "Commerce",
      "Catalog",
      "Tag Operations",
      "Customers",
      "Configuration",
      "System",
    ]);
  });

  it("consolidates the catalog into one sidebar destination", () => {
    const catalog = adminNavGroups.find((group) => group.label === "Catalog")!;
    expect(catalog.items.map((item) => item.label)).toEqual(["Tag Catalog"]);
    expect(catalog.items[0].href).toBe("/admin/tag-products");
    expect(adminNavGroups.flatMap((group) => group.items).filter((item) =>
      ["Tag Products", "Promotions", "Catalog Settings"].includes(item.label)
    )).toHaveLength(0);
  });

  it("keeps configuration modules under Configuration", () => {

    const configuration = adminNavGroups.find((group) => group.label === "Configuration")!;
    expect(configuration.items.map((item) => item.label)).toEqual([
      "Plans",
      "Business Identity",
      "Delivery Rates",
      "Shipping & Fulfilment",
      "Order Checkout",
      "Sample Experience",
      "Email Templates",
    ]);

    // Operational status is read-only, so it sits outside Configuration.
    const system = adminNavGroups.find((group) => group.label === "System")!;
    expect(system.items.map((item) => item.label)).toEqual(["Operational Status"]);
  });

  it("never renders empty groups", () => {
    expect(
      visibleAdminNavGroups(superAdminCapabilities).every((group) => group.items.length > 0)
    ).toBe(true);
  });

  it.each<AdminOperationalRole>(["OwnerSupport", "Operations", "Admin", "SuperAdmin"])(
    "reflects the API-backed %s capabilities without hiding meaningful mixed workspaces",
    (role) => {
      const groups = visibleAdminNavGroups(capabilitiesFor(role));
      const labels = groups.flatMap((group) => group.items.map((item) => item.label));

      expect(groups.every((group) => group.items.length > 0)).toBe(true);
      expect(labels.filter((label) => label === "Tag Catalog")).toHaveLength(1);
      expect(labels).toContain("Merchant Sales");
    }
  );

  it("removes capability-hidden items and the empty groups they leave behind", () => {
    const gatedGroups = [
      {
        id: "finance-only",
        label: "Finance only",
        items: [{
          href: "/admin/finance-only",
          label: "Finance only",
          icon: "record" as const,
          requiredAnyCapabilities: ["canViewCommissionFinancials" as const],
        }],
      },
    ];

    expect(visibleAdminNavGroups(capabilitiesFor("OwnerSupport"), gatedGroups)).toEqual([]);
    expect(visibleAdminNavGroups(capabilitiesFor("Admin"), gatedGroups)).toHaveLength(1);
  });

  it("matches plain routes including nested paths", () => {
    const orders = adminNavGroups
      .flatMap((group) => group.items)
      .find((item) => item.label === "Retail Orders")!;

    expect(isAdminNavItemActive(orders, "/admin/orders", "")).toBe(true);
    expect(isAdminNavItemActive(orders, "/admin/orders/123", "")).toBe(true);
    expect(isAdminNavItemActive(orders, "/admin/tags", "")).toBe(false);
  });

  it("keeps Tag Catalog active across its base route and every deep-linked tab", () => {
    const catalog = adminNavGroups.find((group) => group.label === "Catalog")!.items[0];

    expect(isAdminNavItemActive(catalog, "/admin/tag-products", "")).toBe(true);
    expect(isAdminNavItemActive(catalog, "/admin/tag-products", "?tab=products")).toBe(true);
    expect(isAdminNavItemActive(catalog, "/admin/tag-products", "?tab=promotions")).toBe(true);
    expect(isAdminNavItemActive(catalog, "/admin/tag-products", "?tab=settings")).toBe(true);
  });

  it("keeps Overview exact-match so it does not swallow every admin route", () => {
    const overview = adminNavGroups[0].items[0];
    expect(isAdminNavItemActive(overview, "/admin", "")).toBe(true);
    expect(isAdminNavItemActive(overview, "/admin/orders", "")).toBe(false);
  });

  it("labels the mobile header from the active route", () => {
    expect(activeAdminNavLabel("/admin/tag-products", "?tab=promotions")).toBe("Tag Catalog");
    expect(activeAdminNavLabel("/admin/tag-inventory", "")).toBe("Tag Inventory");
    expect(activeAdminNavLabel("/admin/order-checkout", "")).toBe("Order Checkout");
    expect(activeAdminNavLabel("/somewhere-else", "")).toBe("Admin");
  });
});

describe("section expansion", () => {
  it("gives every section a stable id that is not derived from its label", () => {
    const ids = adminNavGroups.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("commerce");
    expect(ids).toContain("catalog");
  });

  it("finds the section holding the active route", () => {
    expect(activeAdminNavGroupId("/admin/orders", "")).toBe("commerce");
    expect(activeAdminNavGroupId("/admin/tag-inventory", "")).toBe("tag-operations");
    expect(activeAdminNavGroupId("/admin/tag-products", "?tab=promotions")).toBe("catalog");
    expect(activeAdminNavGroupId("/admin/nowhere", "")).toBeNull();
  });

  it("opens only the active section for a first-time visitor", () => {
    const commerce = adminNavGroups.find((group) => group.id === "commerce")!;
    const catalog = adminNavGroups.find((group) => group.id === "catalog")!;

    expect(isAdminNavGroupOpen(commerce, "commerce", {})).toBe(true);
    expect(isAdminNavGroupOpen(catalog, "commerce", {})).toBe(false);
  });

  it("honours a stored choice for sections you are not currently in", () => {
    const catalog = adminNavGroups.find((group) => group.id === "catalog")!;

    expect(isAdminNavGroupOpen(catalog, "commerce", { catalog: true })).toBe(true);
    expect(isAdminNavGroupOpen(catalog, "commerce", { catalog: false })).toBe(false);
  });

  it("refuses to hide the section you are in, whatever was stored", () => {
    const commerce = adminNavGroups.find((group) => group.id === "commerce")!;

    expect(isAdminNavGroupOpen(commerce, "commerce", { commerce: false })).toBe(true);
  });

  it("always shows ungrouped items, which have no heading to click", () => {
    const overview = adminNavGroups.find((group) => group.id === "overview")!;

    expect(isAdminNavGroupOpen(overview, null, { overview: false })).toBe(true);
  });
});
