"use client";

import { usePathname } from "next/navigation";
import {
  MobileBottomNavShell,
  type MobileNavAction,
} from "@/components/layouts/MobileBottomNavShell";
import {
  getActiveSocialNavItemId,
  socialNavItems,
} from "@/lib/socialNavigation";
import { useUnreadActivity } from "@/lib/useUnreadActivity";

type SocialBottomNavProps = {
  /** Where "Share a Moment" goes, decided by whether the owner has pets. */
  onCreate: () => void;
  /** The owner's own social profile, or the setup screen if they have none. */
  onProfile: () => void;
};

/**
 * Community's phone navigation.
 *
 * Five destinations because that is what these five jobs are; My Pets keeps its
 * own set. What they now share is the bar itself — the container, the active
 * treatment, the safe-area handling and the touch targets all come from
 * `MobileBottomNavShell`, so the two modes look like one product rather than
 * two apps that happen to be installed together.
 */
export function SocialBottomNav({ onCreate, onProfile }: SocialBottomNavProps) {
  const pathname = usePathname();
  const activeId = getActiveSocialNavItemId(pathname);
  const unread = useUnreadActivity(true);

  if (socialNavItems.length === 0) {
    return null;
  }

  // Create and Profile both depend on something only the server knows — does
  // this owner have pets, have they claimed a handle — so they resolve on press
  // rather than making the shell fetch on every route just in case.
  const items: MobileNavAction[] = socialNavItems.map((item) => ({
    id: item.id,
    label: item.mobileLabel,
    accessibleLabel: item.label,
    icon: item.icon,
    active: activeId === item.id,
    href: item.href,
    onSelect:
      item.id === "create"
        ? onCreate
        : item.id === "profile"
          ? onProfile
          : undefined,
    badge: item.id === "activity" ? unread : undefined,
  }));

  return <MobileBottomNavShell ariaLabel="Community" items={items} />;
}
