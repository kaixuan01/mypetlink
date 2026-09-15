"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { SocialBottomNav } from "@/components/layouts/SocialBottomNav";
import { OwnerKeyboardViewport } from "@/components/layouts/OwnerKeyboardViewport";
import {
  OwnerHeaderActionsProvider,
  OwnerPortalHeader,
} from "@/components/portal/OwnerHeaderActions";
import { Icon, type IconName } from "@/components/ui/Icon";
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
  mobileNav = "manage",
}: {
  children: React.ReactNode;
  allowViewportStickyContent?: boolean;
  /**
   * Which phone bar this page belongs under. One product, two jobs: cramming
   * eleven destinations into five slots would serve neither, so a social page
   * gets the social five and everything else keeps the management five.
   */
  mobileNav?: "manage" | "social";
}) {
  const pathname = usePathname();
  const socialActions = useSocialActions();
  const socialActiveId = getActiveSocialNavItemId(pathname);
  const unreadActivity = useUnreadActivity(socialNavItems.length > 0);
  const router = useRouter();
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

            {socialNavItems.length > 0 ? (
              <nav aria-label="Social" className="mt-6 grid gap-1.5">
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
                      item.id === "create"
                        ? socialActions.openCreate
                        : item.id === "profile"
                          ? socialActions.openOwnProfile
                          : undefined
                    }
                    href={item.href}
                    unread={item.id === "activity" ? unreadActivity : 0}
                  />
                ))}
              </nav>
            ) : null}

            <nav
              aria-label="My pets"
              className={socialNavItems.length > 0 ? "mt-6 grid gap-1.5 pb-4" : "mt-6 grid gap-1.5 pb-4"}
            >
              {socialNavItems.length > 0 && !collapsed ? (
                <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-wide text-pet-muted">
                  My pets
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
          </div>

          <div
            className={`shrink-0 border-t border-pet-border/70 pt-4 ${
              collapsed ? "grid justify-items-center gap-3" : "grid gap-3"
            }`}
          >
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
          <main className="mx-auto min-w-0 w-full max-w-7xl px-4 pb-[var(--owner-mobile-page-bottom-clearance)] pt-5 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>

        {mobileNav === "social" && socialNavItems.length > 0 ? (
          <SocialBottomNav
            onCreate={socialActions.openCreate}
            onProfile={socialActions.openOwnProfile}
          />
        ) : (
          <MobileBottomNav />
        )}
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
