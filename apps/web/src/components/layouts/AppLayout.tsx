"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { SocialBottomNav } from "@/components/layouts/SocialBottomNav";
import { CommunityMomentComposer } from "@/components/social/CommunityMomentComposer";
import { OwnerKeyboardViewport } from "@/components/layouts/OwnerKeyboardViewport";
import {
  OwnerHeaderActionsProvider,
  OwnerPortalHeader,
} from "@/components/portal/OwnerHeaderActions";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  getAppMode,
  getModeSwitchHref,
  getModeSwitchLabel,
  getOtherMode,
  type AppMode,
} from "@/lib/appMode";
import {
  isOwnerNavItemActive,
  ownerNavItems,
  type OwnerNavItem,
} from "@/lib/ownerNavigation";
import {
  getActiveSocialNavItemId,
  socialNavItems,
} from "@/lib/socialNavigation";
import { useSocialActions } from "@/lib/useSocialActions";
import { useUnreadActivity } from "@/lib/useUnreadActivity";
import {
  defaultOwnerSettings,
  getOwnerDisplayName,
  readOwnerSettings,
  subscribeOwnerSettings,
} from "@/lib/ownerSettings";
import {
  getServerSidebarCollapsed,
  getSidebarCollapsed,
  setSidebarCollapsed,
  subscribeSidebarCollapsed,
} from "@/lib/sidebarState";
import { logoutOwner } from "@/services/authService";

export function AppLayout({
  children,
  allowViewportStickyContent = false,
  bleed = false,
  mobileNav,
}: {
  children: React.ReactNode;
  allowViewportStickyContent?: boolean;
  /**
   * The page owns its own canvas: no container, no page padding. Used by a
   * public profile that themes its whole background, which a padded column
   * would cut off at the gutter. The shell still supplies its navigation, and
   * still reserves room for the floating bar underneath.
   */
  bleed?: boolean;
  /**
   * Which phone bar this page belongs under. Normally left unset: the mode is
   * derived from the route so the sidebar and the bar always agree. Pass it
   * only for a surface that belongs to one mode while living at the other's
   * route.
   */
  mobileNav?: AppMode;
}) {
  const pathname = usePathname();
  const mode = getAppMode(pathname);
  const socialActions = useSocialActions();

  const socialActiveId = getActiveSocialNavItemId(pathname);
  const unreadActivity = useUnreadActivity(socialNavItems.length > 0);
  const router = useRouter();

  /*
    A new Moment changes what the surface underneath should show, and the
    surfaces fetch their own data on mount. Refreshing the current route asks
    them to do that again without a full reload and without moving anybody:
    Home may gain the Moment, a profile gains it, and Explore is left to its own
    discovery rules rather than having private content pushed into it.
  */
  const refreshAfterMomentShared = useCallback(() => {
    router.refresh();
  }, [router]);
  const collapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsed,
    getServerSidebarCollapsed
  );
  const ownerDisplayName = useSyncExternalStore(
    subscribeOwnerSettings,
    getClientOwnerDisplayName,
    getServerOwnerDisplayName
  );
  const ownerInitial = ownerDisplayName.charAt(0).toUpperCase() || "P";

  function handleLogout() {
    logoutOwner();
    router.replace("/");
  }

  return (
    <AuthGuard>
      <OwnerHeaderActionsProvider>
        <OwnerKeyboardViewport />
        <div
          className={`min-h-screen bg-pet-cream lg:flex ${
            allowViewportStickyContent ? "overflow-x-clip" : "overflow-x-hidden"
          }`}
        >
        <aside
          className={`hidden shrink-0 border-r border-pet-border bg-white/90 shadow-xl shadow-[#0d1b3d]/5 backdrop-blur transition-[width] duration-300 ease-in-out lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden ${
            collapsed ? "px-3 py-5 lg:w-20" : "p-5 lg:w-72"
          }`}
        >
          <div
            className={`min-h-0 flex-1 overflow-y-auto ${
              collapsed ? "" : "pr-1"
            }`}
          >
            {/* Header: logo + collapse toggle */}
            {collapsed ? (
            <div className="flex flex-col items-center gap-3">
              <Link
                aria-label="MyPetLink home"
                className="grid place-items-center"
                href="/"
              >
                <BrandLogo markOnly className="h-10 w-10" />
              </Link>
              <SidebarToggle
                collapsed={collapsed}
                onClick={() => setSidebarCollapsed(!collapsed)}
              />
            </div>
            ) : (
            <div className="flex items-center justify-between gap-2">
              <Link href="/" className="flex min-w-0 items-center gap-3">
                <BrandLogo markOnly className="h-12 w-12 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black text-pet-ink">
                    MyPetLink
                  </span>
                  <span className="block truncate text-xs font-semibold text-pet-muted">
                    Owner portal
                  </span>
                </span>
              </Link>
              <SidebarToggle
                collapsed={collapsed}
                onClick={() => setSidebarCollapsed(!collapsed)}
              />
            </div>
            )}

            {/* Owner account card / compact avatar */}
            {collapsed ? (
            <div className="mt-7 flex justify-center">
              <span
                className="grid h-11 w-11 place-items-center rounded-full border border-pet-border bg-pet-cream text-sm font-black text-pet-ink"
                title={`${ownerDisplayName} — Pet owner account`}
              >
                {ownerInitial}
              </span>
            </div>
            ) : (
            <div className="brand-paw-dots mt-7 rounded-[1.5rem] border border-pet-border bg-pet-cream p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-pet-ink">
                    {ownerDisplayName}
                  </p>
                  <p className="text-xs text-pet-muted">Pet owner account</p>
                </div>
              </div>
            </div>
            )}

            {/*
              One mode at a time.
              Both lists used to sit in this sidebar together, which put eleven
              destinations on screen and — because each half decided its own
              active state — could show Community Home and Dashboard selected at
              once. The mode comes from the route, so the sidebar always shows
              the half you are actually in.
            */}
            {mode === "community" && socialNavItems.length > 0 ? (
              <nav aria-label="Community" className="mt-6 grid gap-1.5 pb-4">
                {collapsed ? null : (
                  <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-wide text-pet-muted">
                    Community
                  </p>
                )}
                {socialNavItems.map((item) => (
                  <SidebarSocialItem
                    active={socialActiveId === item.id}
                    collapsed={collapsed}
                    icon={item.icon}
                    key={item.id}
                    label={item.label}
                    onSelect={
                      item.id === "create" ? socialActions.openCreate : undefined
                    }
                    href={item.href}
                    unread={item.id === "activity" ? unreadActivity : 0}
                  />
                ))}
              </nav>
            ) : (
              <nav aria-label="My Pets" className="mt-6 grid gap-1.5 pb-4">
                {socialNavItems.length > 0 && !collapsed ? (
                  <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-wide text-pet-muted">
                    My Pets
                  </p>
                ) : null}
                {ownerNavItems.map((item) => (
                  <SidebarNavItem
                    active={isOwnerNavItemActive(item, pathname)}
                    collapsed={collapsed}
                    item={item}
                    key={item.id}
                  />
                ))}
              </nav>
            )}
          </div>

          <div
            className={`shrink-0 border-t border-pet-border/70 pt-4 ${
              collapsed ? "grid justify-items-center gap-3" : "grid gap-3"
            }`}
          >
            {socialNavItems.length > 0 ? (
              <ModeSwitchLink collapsed={collapsed} mode={mode} />
            ) : null}
            {collapsed ? (
              <SidebarTooltipWrap label="Log out">
                <button
                  aria-label="Log out"
                  className="grid h-11 w-11 place-items-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:text-pet-ink"
                  onClick={handleLogout}
                  type="button"
                >
                  <Icon name="logout" className="h-5 w-5" />
                </button>
              </SidebarTooltipWrap>
            ) : (
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-muted transition hover:text-pet-ink"
                onClick={handleLogout}
                type="button"
              >
                <Icon name="logout" className="h-4 w-4" />
                Log out
              </button>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <OwnerPortalHeader />
          <main
            className={
              bleed
                ? "min-w-0 pb-[var(--owner-mobile-page-bottom-clearance)] lg:pb-8"
                : "mx-auto min-w-0 w-full max-w-7xl px-4 pb-[var(--owner-mobile-page-bottom-clearance)] pt-5 sm:px-6 lg:px-8 lg:py-8"
            }
          >
            {children}
          </main>
        </div>

        {/*
          The phone bar follows the same route-derived mode as the sidebar, so
          the two can never disagree about which half you are in. The prop stays
          as an override for a surface that genuinely belongs to one mode while
          living at the other's route.
        */}
        {(mobileNav ?? mode) === "community" && socialNavItems.length > 0 ? (
          <SocialBottomNav
            onCreate={socialActions.openCreate}
            onProfile={socialActions.openOwnProfile}
          />
        ) : (
          <MobileBottomNav />
        )}

        {/*
          Mounted by the shell, not by a page, so Share opens the same composer
          from Home, Explore, Activity, a profile or a Moment — and closing it
          leaves the reader exactly where they were, because they never went
          anywhere. It covers the phone bar rather than sitting under it: the
          dialog is above the bar's layer and marks the page behind it inert.
        */}
        {socialActions.composerOpen ? (
          <CommunityMomentComposer
            onClose={socialActions.closeCreate}
            onCreated={refreshAfterMomentShared}
          />
        ) : null}
        </div>
      </OwnerHeaderActionsProvider>
    </AuthGuard>
  );
}

function getClientOwnerDisplayName() {
  return getOwnerDisplayName(readOwnerSettings());
}

function getServerOwnerDisplayName() {
  return getOwnerDisplayName(defaultOwnerSettings);
}

/**
 * Moving between the two halves of the product.
 *
 * Deliberately worded as the destination — "Switch to Community" — rather than
 * naming the mode you are in, because somebody reading a control wants to know
 * what pressing it does. It goes to that mode's home rather than trying to
 * restore wherever you last were: a remembered route can land you somewhere
 * that no longer exists, and predictable beats clever for a control people use
 * constantly.
 */
function ModeSwitchLink({
  collapsed,
  mode,
}: {
  collapsed: boolean;
  mode: AppMode;
}) {
  const label = getModeSwitchLabel(mode);
  const href = getModeSwitchHref(mode);
  const icon: IconName = getOtherMode(mode) === "community" ? "users" : "pets";

  if (collapsed) {
    return (
      <SidebarTooltipWrap label={label}>
        <Link
          aria-label={label}
          className="grid h-11 w-11 place-items-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:bg-pet-cream hover:text-pet-ink"
          data-testid="mode-switch"
          href={href}
        >
          <Icon aria-hidden="true" className="h-5 w-5" name={icon} />
        </Link>
      </SidebarTooltipWrap>
    );
  }

  return (
    <Link
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
      data-testid="mode-switch"
      href={href}
    >
      <Icon aria-hidden="true" className="h-4 w-4" name={icon} />
      {label}
    </Link>
  );
}

function SidebarToggle({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:bg-pet-cream hover:text-pet-ink"
      onClick={onClick}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      type="button"
    >
      <svg
        aria-hidden="true"
        className={`h-5 w-5 transition-transform duration-300 ${
          collapsed ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path d="m14 6-6 6 6 6" />
      </svg>
    </button>
  );
}

function SidebarNavItem({
  active,
  collapsed,
  item,
}: {
  active: boolean;
  collapsed: boolean;
  item: OwnerNavItem;
}) {
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <SidebarTooltipWrap label={item.label}>
          <Link
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={`grid h-11 w-11 place-items-center rounded-2xl transition ${
              active
                ? "bg-[#e8f3ff] text-pet-teal"
                : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
            }`}
            href={item.href}
          >
            <Icon name={item.icon} className="h-5 w-5" />
          </Link>
        </SidebarTooltipWrap>
      </div>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
        active
          ? "bg-[#e8f3ff] text-pet-teal"
          : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
      }`}
      href={item.href}
    >
      <Icon name={item.icon} className="h-5 w-5 shrink-0" />
      {item.label}
    </Link>
  );
}

function SidebarTooltipWrap({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="group relative">
      {children}
      <span
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-pet-ink px-2.5 py-1 text-xs font-bold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

/**
 * A sidebar row for the social group.
 *
 * Two of these five are not destinations — Share a Moment and My profile both
 * depend on something only the server knows — so this renders either a link or
 * a button rather than pretending everything is an href.
 */
function SidebarSocialItem({
  active,
  collapsed,
  href,
  icon,
  label,
  onSelect,
  unread,
}: {
  active: boolean;
  collapsed: boolean;
  href: string | null;
  icon: IconName;
  label: string;
  onSelect?: () => void;
  unread: number;
}) {
  const className = `flex min-h-11 items-center rounded-full text-sm font-bold transition ${
    collapsed ? "justify-center px-0" : "gap-3 px-3"
  } ${
    active
      ? "bg-pet-ink text-white"
      : "text-pet-ink hover:bg-pet-cream"
  }`;

  const body = (
    <>
      <span className="relative grid place-items-center">
        <Icon aria-hidden="true" className="h-5 w-5" name={icon} />
        {unread > 0 ? (
          <span
            className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-pet-coral px-1 text-[10px] font-black leading-4 text-white"
            data-testid="sidebar-activity-badge"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </span>
      {collapsed ? null : <span className="truncate">{label}</span>}
    </>
  );

  const accessibleLabel = unread > 0 ? `${label}, ${unread} unread` : label;

  return href ? (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={accessibleLabel}
      className={className}
      href={href}
    >
      {body}
    </Link>
  ) : (
    <button
      aria-label={accessibleLabel}
      className={className}
      onClick={onSelect}
      type="button"
    >
      {body}
    </button>
  );
}
