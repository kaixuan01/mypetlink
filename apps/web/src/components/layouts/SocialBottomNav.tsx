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
  /**
   * Retained so callers need not change, but no longer used: the owner's own
   * profile is a route now, so Profile is a plain link rather than something
   * that has to be resolved on press.
   */
  onProfile?: () => void;
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
export function SocialBottomNav({ onCreate }: SocialBottomNavProps) {
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
    // Only Create still resolves on press — it depends on whether the owner has
    // a pet to share. Profile is a plain destination now that the owner's own
    // profile has its own route.
    onSelect: item.id === "create" ? onCreate : undefined,
    badge: item.id === "activity" ? unread : undefined,
  }));

  return <MobileBottomNavShell ariaLabel="Community" items={items} />;
}
