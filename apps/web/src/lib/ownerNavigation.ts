import type { IconName } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";

export type OwnerNavItemId =
  | "dashboard"
  | "pets"
  | "records"
  | "moments"
  | "tags"
  | "orders"
  | "settings";

export type OwnerNavItem = {
  id: OwnerNavItemId;
  href: string;
  label: string;
  mobileLabel: string;
  icon: IconName;
  mobilePriority: "high" | "medium" | "low";
  showInMobilePrimary?: boolean;
};

export const ownerNavItems: OwnerNavItem[] = [
  {
    id: "dashboard",
    href: ownerRoutes.dashboard,
    label: "Dashboard",
    mobileLabel: "Home",
    icon: "home",
    mobilePriority: "high",
    showInMobilePrimary: true,
  },
  {
    id: "pets",
    href: ownerRoutes.pets,
    label: "My Pets",
    mobileLabel: "Pets",
    icon: "pets",
    mobilePriority: "high",
    showInMobilePrimary: true,
  },
  {
    id: "records",
    href: ownerRoutes.records,
    label: "Records",
    mobileLabel: "Records",
    icon: "record",
    mobilePriority: "medium",
  },
  {
    id: "moments",
    href: ownerRoutes.moments,
    label: "Moments",
    mobileLabel: "Moments",
    icon: "heart",
    mobilePriority: "high",
    showInMobilePrimary: true,
  },
  {
    id: "tags",
    href: ownerRoutes.tags,
    label: "Smart Tags",
    mobileLabel: "Tags",
    icon: "tag",
    mobilePriority: "high",
    showInMobilePrimary: true,
  },
  {
    id: "orders",
    href: ownerRoutes.orders,
    label: "Orders",
    mobileLabel: "Orders",
    icon: "record",
    mobilePriority: "medium",
  },
  {
    id: "settings",
    href: ownerRoutes.settings,
    label: "Owner Profile & Contact",
    mobileLabel: "Profile",
    icon: "phone",
    mobilePriority: "low",
  },
];

export function getOwnerNavItemById(id: OwnerNavItemId) {
  return ownerNavItems.find((item) => item.id === id);
}

export function getActiveOwnerNavItemId(pathname: string): OwnerNavItemId {
  if (pathname === ownerRoutes.records || /^\/pets\/[^/]+\/records$/.test(pathname)) {
    return "records";
  }

  if (
    pathname === ownerRoutes.moments ||
    /^\/pets\/[^/]+\/moments(\/new)?$/.test(pathname)
  ) {
    return "moments";
  }

  if (pathname === ownerRoutes.tags || /^\/pets\/[^/]+\/tags/.test(pathname)) {
    return "tags";
  }

  if (pathname === ownerRoutes.orders || pathname.startsWith("/orders/")) {
    return "orders";
  }

  if (pathname === ownerRoutes.settings) {
    return "settings";
  }

  if (
    pathname === ownerRoutes.pets ||
    pathname === ownerRoutes.petNew ||
    /^\/pets\/[^/]+$/.test(pathname) ||
    /^\/pets\/[^/]+\/edit$/.test(pathname) ||
    /^\/pets\/[^/]+\/qr$/.test(pathname) ||
    /^\/pets\/[^/]+\/timeline$/.test(pathname)
  ) {
    return "pets";
  }

  return "dashboard";
}

export function isOwnerNavItemActive(item: OwnerNavItem, pathname: string) {
  return getActiveOwnerNavItemId(pathname) === item.id;
}
