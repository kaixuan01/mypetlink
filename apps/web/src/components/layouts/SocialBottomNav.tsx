"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { socialRoutes } from "@/lib/routes";
import {
  getActiveSocialNavItemId,
  socialNavItems,
  type SocialNavItem,
} from "@/lib/socialNavigation";
import { useUnreadActivity } from "@/lib/useUnreadActivity";

type SocialBottomNavProps = {
  /** Where "Share a Moment" goes, decided by whether the owner has pets. */
  onCreate: () => void;
  /** The owner's own social profile, or the setup screen if they have none. */
  onProfile: () => void;
};

/**
 * The social half's phone navigation.
 *
 * Five destinations because that is what these five jobs are; the management
 * side keeps its own bar with its own five. Trying to serve both from one row
 * was the mismatch this replaces.
 *
 * Familiar shape, MyPetLink expression: our icon set, our pill treatment for
 * the active item, our palette. Nothing here is lifted from another product's
 * spacing or iconography.
 */
export function SocialBottomNav({ onCreate, onProfile }: SocialBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = getActiveSocialNavItemId(pathname);
  const unread = useUnreadActivity(true);

  // Create and Profile both depend on something only the server knows — does
  // this owner have pets, have they claimed a handle — so they resolve on press
  // rather than making the shell fetch on every route just in case.
  const go = useCallback(
    (item: SocialNavItem) => {
      if (item.id === "create") {
        onCreate();
        return;
      }

      if (item.id === "profile") {
        onProfile();
        return;
      }

      router.push(item.href ?? socialRoutes.feed);
    },
    [onCreate, onProfile, router]
  );

  if (socialNavItems.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Social"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-pet-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      data-testid="social-bottom-nav"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${socialNavItems.length}, minmax(0, 1fr))` }}
      >
        {socialNavItems.map((item) => {
          const active = activeId === item.id;
          const href =
            item.id === "create" || item.id === "profile" ? null : item.href;

          const body = (
            <>
              <span className="relative">
                <Icon
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill={active && item.id === "activity" ? "currentColor" : "none"}
                  name={item.icon}
                />
                {item.id === "activity" && unread > 0 ? (
                  <span
                    className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-pet-coral px-1 text-[10px] font-black leading-4 text-white"
                    data-testid="activity-badge"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] font-bold">{item.mobileLabel}</span>
            </>
          );

          const className = `flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 transition ${
            active ? "text-pet-ink" : "text-pet-muted hover:text-pet-ink"
          }`;

          return (
            <li key={item.id}>
              {href ? (
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    item.id === "activity" && unread > 0
                      ? `${item.label}, ${unread} unread`
                      : item.label
                  }
                  className={className}
                  href={href}
                >
                  {body}
                </Link>
              ) : (
                <button
                  aria-label={item.label}
                  className={`w-full ${className}`}
                  onClick={() => go(item)}
                  type="button"
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
