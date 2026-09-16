"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import {
  appModeHome,
  appModeLabels,
  getAppMode,
  getModeSwitchHref,
  getOtherMode,
} from "@/lib/appMode";
import { getMobilePageTitle, isFocusedDetailRoute } from "@/lib/mobilePageTitle";
import { socialNavItems } from "@/lib/socialNavigation";

/**
 * The one mobile header MyPetLink has.
 *
 * It renders two states of the same bar. At the top of a page: the brand, the
 * switch to the other half of the product, and whatever action the page offers.
 * Once that bar has scrolled away: the same row, with the page's name in place
 * of the brand, fixed to the top.
 *
 * **The switch is in both states.** It used to live only in the first one,
 * because the compact bar was owned by the page-action component and therefore
 * only knew about actions. Scrolling any distance took away the only thing on
 * screen saying which half of the product you were in, and the only way back to
 * the other half. That is the whole reason this component exists.
 *
 * **Both halves render this.** Community pages had no compact bar at all — not
 * because anyone decided they should not, but because the bar was conditional on
 * a page action and Community pages have none. So did Orders, Smart Tags and
 * Settings. A title and a mode switch do not depend on a page having something
 * to add.
 */
export function MobileAppHeader({
  renderAction,
}: {
  /**
   * The page's own action, built fresh per state: the compact bar is portalled
   * to the body, so the two states cannot share one element.
   */
  renderAction?: () => ReactNode;
}) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const [compactVisible, setCompactVisible] = useState(false);
  const focused = isFocusedDetailRoute(pathname);

  useEffect(() => {
    const header = headerRef.current;

    if (!header || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const mobileLayout = window.matchMedia("(max-width: 1023px)");
    let observer: IntersectionObserver | null = null;

    function stopObserving() {
      observer?.disconnect();
      observer = null;
    }

    function observeForCurrentLayout() {
      stopObserving();

      if (!mobileLayout.matches || !header) {
        setCompactVisible(false);
        return;
      }

      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;

          // Only once the full bar has passed above the viewport. An element
          // still below the fold must not produce a premature compact bar.
          setCompactVisible(
            !entry.isIntersecting && entry.boundingClientRect.bottom <= 0
          );
        },
        { threshold: 0 }
      );
      observer.observe(header);
    }

    observeForCurrentLayout();
    mobileLayout.addEventListener("change", observeForCurrentLayout);

    return () => {
      stopObserving();
      mobileLayout.removeEventListener("change", observeForCurrentLayout);
    };
  }, []);

  const action = renderAction?.();
  const showCompact = compactVisible && !focused;

  return (
    <>
      <header
        className={`relative z-20 border-b border-pet-border bg-pet-cream/92 px-4 py-4 backdrop-blur lg:border-0 lg:bg-transparent lg:px-8 lg:pb-0 lg:pt-5 lg:backdrop-blur-none ${
          action ? "" : "lg:hidden"
        }`}
        ref={headerRef}
      >
        <div className="flex min-w-0 items-center justify-between gap-2.5">
          {/*
            The brand never shrinks. It was once the only flexible item in this
            row and rendered "My…" — a broken-looking wordmark being the one
            thing on the page that must not look broken. It fits whole or it
            steps back to the mark alone.
          */}
          <Link
            aria-label="MyPetLink home"
            className="flex shrink-0 items-center gap-2.5 lg:hidden"
            href={appModeHome[getAppMode(pathname)]}
          >
            <BrandLogo markOnly className="h-10 w-10 shrink-0" />
            <span className="hidden whitespace-nowrap text-sm font-black text-pet-ink min-[360px]:inline">
              MyPetLink
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2.5">
            <AppModeSwitch pathname={pathname} />
            {action ? (
              <div aria-hidden={showCompact || undefined} inert={showCompact}>
                {action}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {showCompact && typeof document !== "undefined"
        ? createPortal(
            <CompactHeader
              pathname={pathname}
              renderAction={renderAction}
              title={getMobilePageTitle(pathname)}
            />,
            document.body
          )
        : null}
    </>
  );
}

/**
 * The scrolled state: where you are, which half you are in, what you can add.
 *
 * Fixed rather than sticky because the bar it replaces lives inside a shell that
 * scrolls as one; sticky inside that produces a bar that leaves with the page.
 * The full header stays in flow underneath, so nothing shifts when this appears.
 */
function CompactHeader({
  pathname,
  renderAction,
  title,
}: {
  pathname: string;
  renderAction?: () => ReactNode;
  title: string;
}) {
  const action = renderAction?.();

  return (
    <div
      className="owner-sticky-action-bar fixed inset-x-0 top-0 border-b border-pet-border bg-white/95 pt-[env(safe-area-inset-top)] shadow-md shadow-[#0d1b3d]/8 backdrop-blur lg:hidden"
      data-owner-compact-action-bar
      data-testid="mobile-compact-header"
    >
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-2.5 px-3 min-[360px]:px-4 sm:px-6">
        <p
          className="min-w-0 flex-1 truncate text-sm font-black text-pet-ink"
          data-testid="mobile-compact-title"
          title={title}
        >
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <AppModeSwitch pathname={pathname} />
          {action}
        </div>
      </div>
    </div>
  );
}

/**
 * "Community" / "My pets" — the way across.
 *
 * Named for the two halves of the product, never for a mode or a portal. The
 * destination comes from `appMode`, so one file decides which routes belong to
 * which half and this only decides how it looks.
 */
function AppModeSwitch({ pathname }: { pathname: string }) {
  if (socialNavItems.length === 0) {
    return null;
  }

  const other = getOtherMode(getAppMode(pathname));

  return (
    <Link
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-pet-border bg-white px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream lg:hidden"
      data-testid="social-mode-switch"
      href={getModeSwitchHref(getAppMode(pathname))}
    >
      <Icon
        aria-hidden="true"
        className="h-4 w-4"
        name={other === "pets" ? "pets" : "users"}
      />
      {appModeLabels[other]}
    </Link>
  );
}
