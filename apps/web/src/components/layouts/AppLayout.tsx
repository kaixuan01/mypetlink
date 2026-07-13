"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { GlobalAddMenu } from "@/components/portal/GlobalAddMenu";
import { Icon } from "@/components/ui/Icon";
import {
  isOwnerNavItemActive,
  ownerNavItems,
  type OwnerNavItem,
} from "@/lib/ownerNavigation";
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
      <div className="min-h-screen overflow-x-hidden bg-pet-cream pb-[calc(var(--owner-bottom-nav-height)_+_env(safe-area-inset-bottom)_+_1rem)] lg:flex lg:pb-0">
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

            <nav className="mt-6 grid gap-1.5 pb-4">
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
              <GlobalAddMenu variant="icon" />
            ) : (
              <GlobalAddMenu variant="full" />
            )}

            {collapsed ? (
              <SidebarTooltipWrap label="Logout">
                <button
                  aria-label="Logout"
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
                Logout
              </button>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-pet-border bg-pet-cream/92 px-4 py-4 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link href="/dashboard" className="flex items-center gap-3">
                <BrandLogo markOnly className="h-10 w-10" />
                <span className="text-sm font-black text-pet-ink">
                  MyPetLink
                </span>
              </Link>
              <GlobalAddMenu variant="compact" />
            </div>
          </header>
          <main className="mx-auto min-w-0 w-full max-w-7xl px-4 pb-[calc(var(--owner-bottom-nav-height)_+_env(safe-area-inset-bottom)_+_1rem)] pt-5 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>

        <MobileBottomNav />
      </div>
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
