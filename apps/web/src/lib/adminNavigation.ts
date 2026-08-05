import type { IconName } from "@/components/ui/Icon";
import { adminRoutes } from "@/lib/routes";

// Single source of truth for Admin Portal navigation. The desktop sidebar and
// the mobile navigation drawer both render from this structure — never
// duplicate it in a component.

export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconName;
};

export type AdminNavGroup = {
  // Stable key for persisted expand/collapse state. Never derive this from the
  // label — renaming a section must not silently reset someone's preference.
  id: string;
  // null = ungrouped items rendered without a section heading (Overview).
  label: string | null;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    id: "overview",
    label: null,
    items: [{ href: "/admin", label: "Overview", icon: "home" }],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      // "Retail" distinguishes owner purchases from Merchant Sales. The Owner
      // Portal keeps its plain "Orders" — this clarification is Admin-only.
      { href: "/admin/orders", label: "Retail Orders", icon: "record" },
      { href: "/admin/payment-proofs", label: "Payment Proofs", icon: "shield" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { href: `${adminRoutes.productCatalog}?tab=products`, label: "Tag Products", icon: "plans" },
      { href: `${adminRoutes.productCatalog}?tab=promotions`, label: "Promotions", icon: "record" },
      { href: `${adminRoutes.productCatalog}?tab=settings`, label: "Catalog Settings", icon: "settings" },
    ],
  },
  {
    id: "tag-operations",
    label: "Tag Operations",
    items: [
      { href: "/admin/tag-inventory", label: "Tag Inventory", icon: "copy" },
      { href: "/admin/tags", label: "Smart Tags", icon: "tag" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      { href: "/admin/pets", label: "Pets", icon: "pets" },
      { href: "/admin/users", label: "Owners", icon: "users" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      { href: "/admin/plans", label: "Plans", icon: "plans" },
      { href: adminRoutes.businessIdentity, label: "Business Identity", icon: "shield" },
      { href: adminRoutes.deliveryRates, label: "Delivery Rates", icon: "record" },
      { href: adminRoutes.shippingFulfilment, label: "Shipping & Fulfilment", icon: "tag" },
      { href: adminRoutes.orderCheckout, label: "Order Checkout", icon: "settings" },
      { href: adminRoutes.emailTemplates, label: "Email Templates", icon: "settings" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: adminRoutes.operationalStatus, label: "Operational Status", icon: "settings" },
    ],
  },
];

// Active-state matching that also understands query-driven tabs (the Catalog
// items share /admin/tag-products and differ only by ?tab=). `search` is the
// current location's query string ("?tab=promotions" or "").
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

// Groups with no visible items must not render; today all items are always
// visible, but the filter keeps that invariant if items become conditional.
export function visibleAdminNavGroups(): AdminNavGroup[] {
  return adminNavGroups.filter((group) => group.items.length > 0);
}

/**
 * The section containing the current route, so it can be opened automatically.
 *
 * Collapsing sections must never be able to hide where you actually are: the
 * sidebar treats this section as open regardless of what was stored.
 */
export function activeAdminNavGroupId(
  pathname: string,
  search: string
): string | null {
  for (const group of adminNavGroups) {
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
export function activeAdminNavLabel(pathname: string, search: string): string {
  for (const group of adminNavGroups) {
    for (const item of group.items) {
      if (isAdminNavItemActive(item, pathname, search)) {
        return item.label;
      }
    }
  }

  return "Admin";
}
