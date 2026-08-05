import { describe, expect, it } from "vitest";
import {
  activeAdminNavGroupId,
  activeAdminNavLabel,
  adminNavGroups,
  isAdminNavGroupOpen,
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
      "System",
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
    expect(configuration.items.map((item) => item.label)).toEqual([
      "Plans",
      "Business Identity",
      "Delivery Rates",
      "Shipping & Fulfilment",
      "Order Checkout",
      "Email Templates",
    ]);

    // Operational status is read-only, so it sits outside Configuration.
    const system = adminNavGroups.find((group) => group.label === "System")!;
    expect(system.items.map((item) => item.label)).toEqual(["Operational Status"]);
  });

  it("never renders empty groups", () => {
    expect(visibleAdminNavGroups().every((group) => group.items.length > 0)).toBe(true);
  });

  it("matches plain routes including nested paths", () => {
    const orders = adminNavGroups
      .flatMap((group) => group.items)
      .find((item) => item.label === "Retail Orders")!;

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
