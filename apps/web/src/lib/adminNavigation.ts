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
  // null = ungrouped items rendered without a section heading (Overview).
  label: string | null;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: null,
    items: [{ href: "/admin", label: "Overview", icon: "home" }],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/orders", label: "Orders", icon: "record" },
      { href: "/admin/payment-proofs", label: "Payment Proofs", icon: "shield" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: `${adminRoutes.productCatalog}?tab=products`, label: "Tag Products", icon: "plans" },
      { href: `${adminRoutes.productCatalog}?tab=promotions`, label: "Promotions", icon: "record" },
      { href: `${adminRoutes.productCatalog}?tab=settings`, label: "Catalog Settings", icon: "settings" },
    ],
  },
  {
    label: "Tag Operations",
    items: [
      { href: "/admin/tag-inventory", label: "Tag Inventory", icon: "copy" },
      { href: "/admin/tags", label: "Smart Tags", icon: "tag" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/admin/pets", label: "Pets", icon: "pets" },
      { href: "/admin/users", label: "Owners", icon: "users" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/admin/plans", label: "Plans", icon: "plans" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
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
