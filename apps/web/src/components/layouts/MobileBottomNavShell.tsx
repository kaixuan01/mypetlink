"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The one phone navigation bar MyPetLink has.
 *
 * Community and My Pets are different jobs with different destinations, and for
 * a while they had different bars to match: one a floating rounded card inset
 * from the edges, the other an edge-to-edge strip with a hairline top border.
 * Same product, same phone, two visual systems — which reads as two apps rather
 * than two modes of one.
 *
 * So the container, the item shape, the active treatment, the icon and label
 * sizing, the safe-area handling and the touch targets all live here, and the
 * two modes supply nothing but their own items. Item counts deliberately differ
 * — Community has five, My Pets has four plus More — and the grid adapts rather
 * than forcing either half into the other's shape.
 */

export type MobileNavAction = {
  id: string;
  /** What is printed under the icon. Short, because the slot is narrow. */
  label: string;
  /**
   * The fuller name for assistive technology, when the printed one is an
   * abbreviation. "Share" fits the slot; "Share a Moment" is what it means.
   */
  accessibleLabel?: string;
  icon: IconName;
  active: boolean;
  /** A destination, or null for an action that opens something in place. */
  href: string | null;
  onSelect?: () => void;
  /** Unread count shown on the icon. Zero renders nothing. */
  badge?: number;
  ariaExpanded?: boolean;
  ariaHasPopup?: boolean;
};

export function MobileBottomNavShell({
  ariaLabel,
  items,
  navRef,
  children,
}: {
  ariaLabel: string;
  items: MobileNavAction[];
  navRef?: React.Ref<HTMLElement>;
  /** Anything that belongs inside the bar's stacking context, like a sheet. */
  children?: ReactNode;
}) {
  return (
    <>
      <nav
        aria-label={ariaLabel}
        className="owner-mobile-bottom-nav fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 grid rounded-[1.75rem] border border-pet-border bg-white/95 p-2 shadow-xl shadow-[#0d1b3d]/10 backdrop-blur lg:hidden"
        data-testid="mobile-bottom-nav"
        ref={navRef}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <MobileBottomNavItem item={item} key={item.id} />
        ))}
      </nav>
      {children}
    </>
  );
}

export function MobileBottomNavItem({ item }: { item: MobileNavAction }) {
  const className = `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-full px-1.5 py-2 text-center transition ${
    item.active ? "bg-[#e8f3ff] text-pet-teal" : "text-pet-muted hover:bg-pet-cream"
  }`;

  const body = (
    <>
      <span className="relative grid place-items-center">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" name={item.icon} />
        {item.badge && item.badge > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-pet-coral px-1 text-[10px] font-black leading-4 text-white"
            data-testid="mobile-nav-badge"
          >
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        ) : null}
      </span>
      <span className="block max-w-full truncate text-[11px] font-bold leading-none">
        {item.label}
      </span>
    </>
  );

  // The count is in the accessible name rather than only in the badge, so it is
  // not something you have to be able to see.
  const spokenName = item.accessibleLabel ?? item.label;
  const accessibleLabel =
    item.badge && item.badge > 0 ? `${spokenName}, ${item.badge} unread` : spokenName;

  if (!item.href) {
    return (
      <button
        aria-expanded={item.ariaExpanded}
        aria-haspopup={item.ariaHasPopup ? "dialog" : undefined}
        aria-label={accessibleLabel}
        className={className}
        data-testid="mobile-nav-item"
        onClick={item.onSelect}
        type="button"
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      aria-current={item.active ? "page" : undefined}
      aria-label={accessibleLabel}
      className={className}
      data-testid="mobile-nav-item"
      href={item.href}
      onClick={item.onSelect}
    >
      {body}
    </Link>
  );
}
