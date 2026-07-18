"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  getActiveOwnerNavItemId,
  ownerNavItems,
  type OwnerNavItem,
  type OwnerNavItemId,
} from "@/lib/ownerNavigation";
import { logoutOwner } from "@/services/authService";

// Primary slots adapt to product availability: while Smart Tags is hidden,
// Moments takes the Tags slot so no dead tab is left behind. Records stays in
// the More menu while only four primary items fit.
const tagsAvailable = ownerNavItems.some((item) => item.id === "tags");

const widePrimaryIds: OwnerNavItemId[] = tagsAvailable
  ? ["dashboard", "pets", "moments", "tags"]
  : ["dashboard", "pets", "moments"];

const narrowPrimaryIds: OwnerNavItemId[] = tagsAvailable
  ? ["dashboard", "pets", "tags"]
  : ["dashboard", "pets", "moments"];

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(430);
  const [moreOpen, setMoreOpen] = useState(false);
  const activeId = getActiveOwnerNavItemId(pathname);
  // The launch navigation is always Home / Pets / Moments / More, including
  // at 320px. When Tags returns, the older adaptive layout can still reduce
  // the number of direct feature slots at very narrow widths.
  const primaryIds = tagsAvailable
    ? availableWidth < 380
      ? narrowPrimaryIds
      : widePrimaryIds.slice(0, getPrimaryCount(availableWidth))
    : widePrimaryIds;
  const primaryItems = primaryIds
    .map((id) => ownerNavItems.find((item) => item.id === id))
    .filter((item): item is OwnerNavItem => Boolean(item));
  const hiddenItems = ownerNavItems.filter(
    (item) => !primaryIds.includes(item.id)
  );
  const activeItemIsAvailable = ownerNavItems.some(
    (item) => item.id === activeId
  );
  const moreActive =
    !activeItemIsAvailable || hiddenItems.some((item) => item.id === activeId);
  const gridTemplateColumns = `repeat(${primaryItems.length + 1}, minmax(0, 1fr))`;

  useEffect(() => {
    const nav = navRef.current;

    if (!nav) {
      return undefined;
    }

    function updateWidth() {
      if (nav) {
        setAvailableWidth(nav.clientWidth);
      }
    }

    updateWidth();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateWidth)
        : null;

    observer?.observe(nav);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  function handleLogout() {
    setMoreOpen(false);
    logoutOwner();
    router.replace("/");
  }

  return (
    <>
      <nav
        aria-label="Owner portal"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 grid rounded-[1.75rem] border border-pet-border bg-white/95 p-2 shadow-xl shadow-[#0d1b3d]/10 backdrop-blur lg:hidden"
        ref={navRef}
        style={{ gridTemplateColumns }}
      >
        {primaryItems.map((item) => (
          <BottomNavItem
            active={item.id === activeId}
            href={item.href}
            icon={item.icon}
            key={item.id}
            label={item.mobileLabel}
            onClick={() => setMoreOpen(false)}
          />
        ))}

        <BottomNavItem
          active={moreActive || moreOpen}
          ariaExpanded={moreOpen}
          icon="more"
          label="More"
          onClick={() => setMoreOpen((open) => !open)}
        />
      </nav>

      {moreOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-40 bg-pet-ink/25 backdrop-blur-[2px] lg:hidden"
          role="dialog"
        >
          <button
            aria-label="Close more menu"
            className="absolute inset-0 cursor-default"
            onClick={() => setMoreOpen(false)}
            type="button"
          />
          <section className="fixed inset-x-3 bottom-[calc(6.35rem+env(safe-area-inset-bottom))] z-50 rounded-[2rem] border border-pet-border bg-white p-4 shadow-2xl shadow-[#0d1b3d]/20">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-lg font-black text-pet-ink">More</h2>
                <p className="mt-1 text-xs font-semibold text-pet-muted">
                  Contact details, owner tools, and account preferences.
                </p>
              </div>
              <button
                className="grid h-10 w-10 place-items-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:bg-pet-cream hover:text-pet-ink"
                onClick={() => setMoreOpen(false)}
                type="button"
              >
                <span className="sr-only">Close</span>
                <Icon name="plus" className="h-5 w-5 rotate-45" />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {hiddenItems.map((item) => (
                <MoreMenuLink
                  active={item.id === activeId}
                  item={item}
                  key={item.id}
                  onClick={() => setMoreOpen(false)}
                />
              ))}
              <button
                className="flex min-h-12 items-center gap-3 rounded-[1.25rem] px-4 py-3 text-left text-sm font-bold text-pet-muted transition hover:bg-pet-cream hover:text-pet-ink"
                onClick={handleLogout}
                type="button"
              >
                <Icon name="logout" className="h-5 w-5 shrink-0" />
                Logout
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function BottomNavItem({
  active,
  ariaExpanded,
  href,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  ariaExpanded?: boolean;
  href?: string;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  const content = (
    <>
      <Icon name={icon} className="h-4 w-4 shrink-0" />
      <span className="block max-w-full truncate text-[11px] font-bold leading-none">
        {label}
      </span>
    </>
  );

  if (!href) {
    return (
      <button
        aria-expanded={ariaExpanded}
        aria-haspopup="dialog"
        className={getBottomNavClassName(active)}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={getBottomNavClassName(active)}
      href={href}
      onClick={onClick}
    >
      {content}
    </Link>
  );
}

function MoreMenuLink({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: OwnerNavItem;
  onClick: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm font-bold transition ${
        active
          ? "bg-[#e8f3ff] text-pet-teal"
          : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
      }`}
      href={item.href}
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon name={item.icon} className="h-5 w-5 shrink-0" />
        <span className="truncate">{item.label}</span>
      </span>
    </Link>
  );
}

function getPrimaryCount(width: number) {
  if (width < 330) {
    return 2;
  }

  if (width < 380) {
    return 3;
  }

  return 4;
}

function getBottomNavClassName(active: boolean) {
  return `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-full px-1.5 py-2 text-center transition ${
    active ? "bg-[#e8f3ff] text-pet-teal" : "text-pet-muted hover:bg-pet-cream"
  }`;
}
