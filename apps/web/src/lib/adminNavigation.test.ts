import { describe, expect, it } from "vitest";
import {
  activeAdminNavLabel,
  adminNavGroups,
  isAdminNavItemActive,
  visibleAdminNavGroups,
} from "./adminNavigation";

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
    ]);
  });

  it("places catalog modules under Catalog and configuration modules under Configuration", () => {
    const catalog = adminNavGroups.find((group) => group.label === "Catalog")!;
    expect(catalog.items.map((item) => item.label)).toEqual([
      "Tag Products",
      "Promotions",
      "Catalog Settings",
    ]);

    const configuration = adminNavGroups.find((group) => group.label === "Configuration")!;
    expect(configuration.items.map((item) => item.label)).toEqual(["Plans", "Settings"]);
  });

  it("never renders empty groups", () => {
    expect(visibleAdminNavGroups().every((group) => group.items.length > 0)).toBe(true);
  });

  it("matches plain routes including nested paths", () => {
    const orders = adminNavGroups
      .flatMap((group) => group.items)
      .find((item) => item.label === "Orders")!;

    expect(isAdminNavItemActive(orders, "/admin/orders", "")).toBe(true);
    expect(isAdminNavItemActive(orders, "/admin/orders/123", "")).toBe(true);
    expect(isAdminNavItemActive(orders, "/admin/tags", "")).toBe(false);
  });

  it("distinguishes the query-driven Catalog tabs", () => {
    const items = adminNavGroups.find((group) => group.label === "Catalog")!.items;
    const [products, promotions, settings] = items;

    expect(isAdminNavItemActive(promotions, "/admin/tag-products", "?tab=promotions")).toBe(true);
    expect(isAdminNavItemActive(products, "/admin/tag-products", "?tab=promotions")).toBe(false);
    expect(isAdminNavItemActive(settings, "/admin/tag-products", "?tab=settings")).toBe(true);
    // No tab param = the default products tab.
    expect(isAdminNavItemActive(products, "/admin/tag-products", "")).toBe(true);
    expect(isAdminNavItemActive(promotions, "/admin/tag-products", "")).toBe(false);
  });

  it("keeps Overview exact-match so it does not swallow every admin route", () => {
    const overview = adminNavGroups[0].items[0];
    expect(isAdminNavItemActive(overview, "/admin", "")).toBe(true);
    expect(isAdminNavItemActive(overview, "/admin/orders", "")).toBe(false);
  });

  it("labels the mobile header from the active route", () => {
    expect(activeAdminNavLabel("/admin/tag-products", "?tab=promotions")).toBe("Promotions");
    expect(activeAdminNavLabel("/admin/tag-inventory", "")).toBe("Tag Inventory");
    expect(activeAdminNavLabel("/somewhere-else", "")).toBe("Admin");
  });
});
