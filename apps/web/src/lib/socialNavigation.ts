import type { IconName } from "@/components/ui/Icon";
import {
  ownerProductFeatures,
  type OwnerProductFeatures,
} from "@/lib/features";
import { ownerRoutes, socialRoutes } from "@/lib/routes";

/**
 * MyPetLink has two jobs, and they are genuinely different.
 *
 * SOCIAL is where somebody browses and interacts: a feed, Explore, activity,
 * their own public profile. MANAGE is where they look after a real animal:
 * pets, care, safety, Smart Tags, orders, account.
 *
 * They share one shell and one account, but they do not share a navigation
 * bar — cramming eleven destinations into five phone-sized slots serves
 * neither. This file describes the social half; `ownerNavigation` describes
 * the other. Both are rendered by every surface from these lists alone, so a
 * feature flag hides a destination everywhere at once, keyboard order
 * included.
 */

export type SocialNavItemId =
  | "feed"
  | "explore"
  | "create"
  | "activity"
  | "profile";

export type SocialNavItem = {
  id: SocialNavItemId;
  /** Null for actions that are not a destination, like Create. */
  href: string | null;
  label: string;
  mobileLabel: string;
  icon: IconName;
};

const allSocialNavItems: SocialNavItem[] = [
  {
    id: "feed",
    href: socialRoutes.feed,
    label: "Home",
    mobileLabel: "Home",
    icon: "home",
  },
  {
    id: "explore",
    href: socialRoutes.explore,
    label: "Explore",
    mobileLabel: "Explore",
    icon: "search",
  },
  {
    id: "create",
    href: null,
    label: "Share a Moment",
    mobileLabel: "Share",
    icon: "plus",
  },
  {
    id: "activity",
    href: socialRoutes.notifications,
    label: "Activity",
    mobileLabel: "Activity",
    icon: "heart",
  },
  {
    // A real destination now that the owner's own profile has its own route.
    // It used to be an action: resolve the handle, then push /u/{handle} —
    // which meant it could not be a link, could not carry aria-current, and
    // sent the owner to the public page in a bare shell.
    id: "profile",
    href: ownerRoutes.socialProfile,
    label: "My profile",
    mobileLabel: "Profile",
    icon: "users",
  },
];

export function getSocialNavItems(
  features: OwnerProductFeatures = ownerProductFeatures
) {
  return features.socialEnabled ? allSocialNavItems : [];
}

export const socialNavItems: SocialNavItem[] = getSocialNavItems();

/** Every route that belongs to the social half of the product. */
export function isSocialPath(pathname: string) {
  return (
    pathname === socialRoutes.feed ||
    pathname === socialRoutes.explore ||
    pathname === socialRoutes.search ||
    pathname === socialRoutes.notifications ||
    pathname === ownerRoutes.socialProfile ||
    pathname.startsWith(`${ownerRoutes.socialProfile}/`) ||
    pathname.startsWith("/u/") ||
    pathname.startsWith("/moments/")
  );
}

export function getActiveSocialNavItemId(
  pathname: string
): SocialNavItemId | null {
  if (pathname === socialRoutes.feed) return "feed";
  if (pathname === socialRoutes.explore || pathname === socialRoutes.search) {
    return "explore";
  }
  if (pathname === socialRoutes.notifications) return "activity";
  if (
    pathname === ownerRoutes.socialProfile ||
    pathname.startsWith(`${ownerRoutes.socialProfile}/`) ||
    pathname.startsWith("/u/")
  ) {
    return "profile";
  }

  return null;
}
