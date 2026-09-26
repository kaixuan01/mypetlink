import { describe, expect, it } from "vitest";
import {
  activeAdminNavGroupId,
  activeAdminNavLabel,
  adminNavGroups,
  isAdminNavGroupOpen,
  isAdminNavItemActive,
  requiredCapabilitiesForPath,
  visibleAdminNavGroups,
} from "./adminNavigation";
import {
  adminCapabilities,
  allAdminCapabilities,
  noAdminAccess,
  type AdminAccessCapabilities,
  type AdminCapabilityKey,
} from "./adminCapabilities";

function accessWith(...capabilities: AdminCapabilityKey[]): AdminAccessCapabilities {
  return { isSuperAdmin: false, roles: [], granted: new Set(capabilities) };
}

const superAdmin = allAdminCapabilities();

describe("adminNavigation", () => {
  it("defines the approved groups in order", () => {
    expect(adminNavGroups.map((group) => group.label)).toEqual([
      null,
      "Commerce",
      "Catalog",
      "Tag Operations",
      "Customers",
      "Community",
      "Configuration",
      "Access Management",
      "System",
    ]);
  });

  it("consolidates the catalog into one sidebar destination", () => {
    const catalog = adminNavGroups.find((group) => group.label === "Catalog")!;
    expect(catalog.items.map((item) => item.label)).toEqual(["Tag Catalog"]);
    expect(catalog.items[0].href).toBe("/admin/tag-products");
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

  it("groups Users, Roles and Activity History under Access Management", () => {
    const group = adminNavGroups.find((item) => item.label === "Access Management")!;
    expect(group.items.map((item) => item.label)).toEqual([
      "Users",
      "Roles",
      "Activity History",
    ]);
  });

  it("gives every destination except Overview a permission to require", () => {
    const ungated = adminNavGroups
      .flatMap((group) => group.items)
      .filter((item) => item.href !== "/admin" && !item.requiredAnyCapabilities?.length);

    expect(ungated.map((item) => item.label)).toEqual([]);
  });

  it("shows nothing but Overview to somebody with no permissions", () => {
    const groups = visibleAdminNavGroups(noAdminAccess);
    expect(groups.flatMap((group) => group.items.map((item) => item.label))).toEqual([
      "Overview",
    ]);
  });

  it("shows every destination to a Super Admin", () => {
    const groups = visibleAdminNavGroups(superAdmin);
    expect(groups).toHaveLength(adminNavGroups.length);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
  });

  it("shows a payments-only operator only what they can open", () => {
    const groups = visibleAdminNavGroups(
      accessWith(adminCapabilities.paymentProofsView, adminCapabilities.ordersView)
    );

    const labels = groups.flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toEqual(["Overview", "Retail Orders", "Payment Proofs"]);
    expect(labels).not.toContain("Tag Inventory");
    expect(labels).not.toContain("Users");
  });

  it("hides Merchant Sales unless at least one of its sections is reachable", () => {
    const withoutSales = visibleAdminNavGroups(accessWith(adminCapabilities.ordersView));
    expect(
      withoutSales.flatMap((group) => group.items.map((item) => item.label))
    ).not.toContain("Merchant Sales");

    const withInvoicesOnly = visibleAdminNavGroups(
      accessWith(adminCapabilities.merchantInvoicesView)
    );
    expect(
      withInvoicesOnly.flatMap((group) => group.items.map((item) => item.label))
    ).toContain("Merchant Sales");
  });

  it("shows Community Reports only with its view capability", () => {
    const labels = (access: AdminAccessCapabilities) => visibleAdminNavGroups(access)
      .flatMap((group) => group.items.map((item) => item.label));
    expect(labels(accessWith(adminCapabilities.communityReportsView))).toContain("Community Reports");
    expect(labels(accessWith(adminCapabilities.communityReportsResolve))).not.toContain("Community Reports");
    expect(requiredCapabilitiesForPath("/admin/community-reports")).toEqual([adminCapabilities.communityReportsView]);
  });

  it("hides Access Management from somebody who cannot see it", () => {
    const groups = visibleAdminNavGroups(accessWith(adminCapabilities.ordersView));
    expect(groups.map((group) => group.label)).not.toContain("Access Management");
  });

  it("shows Roles but not Users to somebody who can only see roles", () => {
    const groups = visibleAdminNavGroups(accessWith(adminCapabilities.adminRolesView));
    const access = groups.find((group) => group.label === "Access Management")!;
    expect(access.items.map((item) => item.label)).toEqual(["Roles"]);
  });

  it("never renders empty groups", () => {
    for (const access of [superAdmin, noAdminAccess, accessWith(adminCapabilities.petsView)]) {
      expect(visibleAdminNavGroups(access).every((group) => group.items.length > 0)).toBe(true);
    }
  });

  it("removes capability-hidden items and the empty groups they leave behind", () => {
    const gatedGroups = [
      {
        id: "finance-only",
        label: "Finance only",
        items: [
          {
            href: "/admin/finance-only",
            label: "Finance only",
            icon: "record" as const,
            requiredAnyCapabilities: [adminCapabilities.salesCommissionsView],
          },
        ],
      },
    ];

    expect(visibleAdminNavGroups(accessWith(adminCapabilities.ordersView), gatedGroups)).toEqual([]);
    expect(
      visibleAdminNavGroups(accessWith(adminCapabilities.salesCommissionsView), gatedGroups)
    ).toHaveLength(1);
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
  });

  it("keeps Overview exact-match so it does not swallow every admin route", () => {
    const overview = adminNavGroups[0].items[0];
    expect(isAdminNavItemActive(overview, "/admin", "")).toBe(true);
    expect(isAdminNavItemActive(overview, "/admin/orders", "")).toBe(false);
  });

  it("labels the mobile header from the active route", () => {
    expect(activeAdminNavLabel("/admin/tag-products", "?tab=promotions")).toBe("Tag Catalog");
    expect(activeAdminNavLabel("/admin/tag-inventory", "")).toBe("Tag Inventory");
    expect(activeAdminNavLabel("/admin/access/roles", "")).toBe("Roles");
    expect(activeAdminNavLabel("/somewhere-else", "")).toBe("Admin");
  });
});

describe("opening a URL directly", () => {
  it("reports the permissions a destination needs", () => {
    expect(requiredCapabilitiesForPath("/admin/tag-inventory")).toEqual([
      adminCapabilities.inventoryView,
      adminCapabilities.inventoryCostsView,
    ]);
    expect(requiredCapabilitiesForPath("/admin/access/users")).toEqual([
      adminCapabilities.adminUsersView,
    ]);
  });

  it("uses the capability for the selected catalog section", () => {
    expect(requiredCapabilitiesForPath("/admin/tag-products", "?tab=products")).toEqual([
      adminCapabilities.catalogView,
    ]);
    expect(requiredCapabilitiesForPath("/admin/tag-products", "?tab=promotions")).toEqual([
      adminCapabilities.marketingView,
    ]);
  });

  it("holds a nested route to the permissions of the destination it belongs to", () => {
    expect(requiredCapabilitiesForPath("/admin/orders/abc-123")).toEqual([
      adminCapabilities.ordersView,
    ]);
  });

  it("requires nothing for Overview, which everyone can open", () => {
    expect(requiredCapabilitiesForPath("/admin")).toEqual([]);
  });

  it("returns null for a path with no navigation entry, leaving it to the API", () => {
    expect(requiredCapabilitiesForPath("/admin/something-new")).toBeNull();
  });
});

describe("section expansion", () => {
  it("gives every section a stable id that is not derived from its label", () => {
    const ids = adminNavGroups.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("commerce");
    expect(ids).toContain("access");
  });

  it("finds the section holding the active route", () => {
    expect(activeAdminNavGroupId("/admin/orders", "")).toBe("commerce");
    expect(activeAdminNavGroupId("/admin/tag-inventory", "")).toBe("tag-operations");
    expect(activeAdminNavGroupId("/admin/access/users", "")).toBe("access");
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
