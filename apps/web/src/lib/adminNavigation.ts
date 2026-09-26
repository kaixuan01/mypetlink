import type { IconName } from "@/components/ui/Icon";
import {
  adminCapabilities,
  hasAnyCapability,
  type AdminAccessCapabilities,
  type AdminCapabilityKey,
} from "@/lib/adminCapabilities";
import { adminRoutes } from "@/lib/routes";

// Single source of truth for Admin Portal navigation. The desktop sidebar and
// the mobile navigation drawer both render from this structure — never
// duplicate it in a component.

export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconName;
  /**
   * The permissions that make this destination worth showing — holding any one
   * of them is enough. This controls discovery only. The destination itself is
   * protected by the API, which refuses the request whatever the menu did.
   */
  requiredAnyCapabilities?: AdminCapabilityKey[];
};

export type AdminNavGroup = {
  // Stable key for persisted expand/collapse state. Never derive this from the
  // label — renaming a section must not silently reset someone's preference.
  id: string;
  // null = ungrouped items rendered without a section heading (Overview).
  label: string | null;
  items: AdminNavItem[];
  requiredAnyCapabilities?: AdminCapabilityKey[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    id: "overview",
    label: null,
    // Everyone lands here. The sections inside the page are themselves filtered
    // by what the operator can open.
    items: [{ href: "/admin", label: "Overview", icon: "home" }],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      // "Retail" distinguishes owner purchases from Merchant Sales. The Owner
      // Portal keeps its plain "Orders" — this clarification is Admin-only.
      {
        href: "/admin/orders",
        label: "Retail Orders",
        icon: "record",
        requiredAnyCapabilities: [adminCapabilities.ordersView],
      },
      {
        href: "/admin/payment-proofs",
        label: "Payment Proofs",
        icon: "shield",
        requiredAnyCapabilities: [adminCapabilities.paymentProofsView],
      },
      // Bulk sales to business customers. One entry: merchants, quotations,
      // orders and invoices are sections inside the workspace, and each of
      // those is filtered again by the permission that section needs.
      {
        href: adminRoutes.merchantSales,
        label: "Merchant Sales",
        icon: "users",
        requiredAnyCapabilities: [
          adminCapabilities.salesView,
          adminCapabilities.merchantOrdersView,
          adminCapabilities.merchantInvoicesView,
          adminCapabilities.salesCommissionsView,
          adminCapabilities.payoutsView,
        ],
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      {
        href: adminRoutes.productCatalog,
        label: "Tag Catalog",
        icon: "plans",
        requiredAnyCapabilities: [
          adminCapabilities.catalogView,
          adminCapabilities.marketingView,
        ],
      },
    ],
  },
  {
    id: "tag-operations",
    label: "Tag Operations",
    items: [
      {
        href: "/admin/tag-inventory",
        label: "Tag Inventory",
        icon: "copy",
        requiredAnyCapabilities: [
          adminCapabilities.inventoryView,
          adminCapabilities.inventoryCostsView,
        ],
      },
      {
        href: "/admin/tags",
        label: "Smart Tags",
        icon: "tag",
        requiredAnyCapabilities: [adminCapabilities.smartTagsView],
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      {
        href: "/admin/pets",
        label: "Pets",
        icon: "pets",
        requiredAnyCapabilities: [adminCapabilities.petsView],
      },
      {
        href: "/admin/users",
        label: "Owners",
        icon: "users",
        requiredAnyCapabilities: [adminCapabilities.ownersView],
      },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [{
      href: adminRoutes.communityReports,
      label: "Community Reports",
      icon: "shield",
      requiredAnyCapabilities: [adminCapabilities.communityReportsView],
    }],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        href: "/admin/plans",
        label: "Plans",
        icon: "plans",
        requiredAnyCapabilities: [adminCapabilities.plansView],
      },
      {
        href: adminRoutes.businessIdentity,
        label: "Business Identity",
        icon: "shield",
        requiredAnyCapabilities: [adminCapabilities.settingsView],
      },
      {
        href: adminRoutes.deliveryRates,
        label: "Delivery Rates",
        icon: "record",
        requiredAnyCapabilities: [adminCapabilities.settingsView],
      },
      {
        href: adminRoutes.shippingFulfilment,
        label: "Shipping & Fulfilment",
        icon: "tag",
        requiredAnyCapabilities: [adminCapabilities.settingsView],
      },
      {
        href: adminRoutes.orderCheckout,
        label: "Order Checkout",
        icon: "settings",
        requiredAnyCapabilities: [adminCapabilities.settingsView],
      },
      {
        href: adminRoutes.sampleExperience,
        label: "Sample Experience",
        icon: "pets",
        requiredAnyCapabilities: [adminCapabilities.sampleExperienceView],
      },
      {
        href: adminRoutes.emailTemplates,
        label: "Email Templates",
        icon: "settings",
        requiredAnyCapabilities: [adminCapabilities.emailTemplatesView],
      },
    ],
  },
  {
    id: "access",
    label: "Access Management",
    items: [
      {
        href: adminRoutes.accessUsers,
        label: "Users",
        icon: "users",
        requiredAnyCapabilities: [adminCapabilities.adminUsersView],
      },
      {
        href: adminRoutes.accessRoles,
        label: "Roles",
        icon: "shield",
        requiredAnyCapabilities: [adminCapabilities.adminRolesView],
      },
      {
        href: adminRoutes.accessAuditLog,
        label: "Activity History",
        icon: "record",
        requiredAnyCapabilities: [adminCapabilities.auditLogView],
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        href: adminRoutes.operationalStatus,
        label: "Operational Status",
        icon: "settings",
        requiredAnyCapabilities: [adminCapabilities.operationalStatusView],
      },
    ],
  },
];

// Active-state matching supports query-driven destinations when a future
// top-level item needs one. Tag Catalog itself is one destination; its tabs
// are handled by the workspace navigation inside the page.
export function isAdminNavItemActive(
  item: AdminNavItem,
  pathname: string,
  search: string
): boolean {
  const [itemPath, itemQuery] = item.href.split("?");

  if (itemPath === "/admin") {
    return pathname === "/admin";
  }

  if (pathname !== itemPath && !pathname.startsWith(`${itemPath}/`)) {
    return false;
  }

  if (!itemQuery) {
    return true;
  }

  const wanted = new URLSearchParams(itemQuery);
  const current = new URLSearchParams(search);

  for (const [key, value] of wanted.entries()) {
    // A missing tab param means the page's default tab, which is the first
    // Catalog item ("products").
    const currentValue = current.get(key) ?? "products";

    if (currentValue !== value) {
      return false;
    }
  }

  return true;
}

function hasRequiredCapability(
  required: AdminCapabilityKey[] | undefined,
  access: AdminAccessCapabilities
): boolean {
  return hasAnyCapability(access, required ?? []);
}

/**
 * The sections and destinations this operator can actually open.
 *
 * A section left with nothing in it disappears entirely, so somebody who only
 * handles payments sees a short, honest menu instead of a long one full of
 * pages that would turn them away.
 */
export function visibleAdminNavGroups(
  access: AdminAccessCapabilities,
  groups: AdminNavGroup[] = adminNavGroups
): AdminNavGroup[] {
  return groups
    .filter((group) => hasRequiredCapability(group.requiredAnyCapabilities, access))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        hasRequiredCapability(item.requiredAnyCapabilities, access)
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The capabilities that make a destination reachable, by path.
 *
 * Used by the page guard so opening a URL directly is held to the same standard
 * as clicking the menu item.
 */
export function requiredCapabilitiesForPath(
  pathname: string,
  search = "",
  groups: AdminNavGroup[] = adminNavGroups
): AdminCapabilityKey[] | null {
  if (pathname === adminRoutes.productCatalog) {
    const tab = new URLSearchParams(search).get("tab") ?? "products";
    return tab === "promotions"
      ? [adminCapabilities.marketingView]
      : [adminCapabilities.catalogView];
  }

  for (const group of groups) {
    for (const item of group.items) {
      if (isAdminNavItemActive(item, pathname, search)) {
        return item.requiredAnyCapabilities ?? [];
      }
    }
  }

  return null;
}

/**
 * The section containing the current route, so it can be opened automatically.
 *
 * Collapsing sections must never be able to hide where you actually are: the
 * sidebar treats this section as open regardless of what was stored.
 */
export function activeAdminNavGroupId(
  pathname: string,
  search: string,
  groups: AdminNavGroup[] = adminNavGroups
): string | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (isAdminNavItemActive(item, pathname, search)) {
        return group.id;
      }
    }
  }

  return null;
}

/**
 * Whether a section should render expanded.
 *
 * First-time behaviour is deliberately quiet: only the section you are in
 * starts open, so a new admin sees a short sidebar rather than every module at
 * once. After that, an explicit choice wins — except for the active section,
 * which stays open so the current page is always reachable.
 */
export function isAdminNavGroupOpen(
  group: AdminNavGroup,
  activeGroupId: string | null,
  stored: Record<string, boolean>
): boolean {
  if (group.label === null) {
    // Ungrouped items have no heading to click.
    return true;
  }

  if (group.id === activeGroupId) {
    return true;
  }

  return stored[group.id] ?? false;
}

// Page title shown in the compact mobile Admin header.
export function activeAdminNavLabel(
  pathname: string,
  search: string,
  groups: AdminNavGroup[] = adminNavGroups
): string {
  for (const group of groups) {
    for (const item of group.items) {
      if (isAdminNavItemActive(item, pathname, search)) {
        return item.label;
      }
    }
  }

  return "Admin";
}
