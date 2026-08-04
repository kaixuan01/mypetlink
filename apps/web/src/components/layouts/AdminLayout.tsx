"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AdminGuard } from "@/components/auth/AdminGuard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import {
  activeAdminNavGroupId,
  activeAdminNavLabel,
  isAdminNavGroupOpen,
  isAdminNavItemActive,
  visibleAdminNavGroups,
} from "@/lib/adminNavigation";
import {
  getAdminNavSections,
  getAdminSidebarCollapsed,
  getServerAdminNavSections,
  getServerAdminSidebarCollapsed,
  setAdminNavSectionOpen,
  setAdminSidebarCollapsed,
  subscribeAdminNavSections,
  subscribeAdminSidebarCollapsed,
} from "@/lib/adminNavState";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import { logoutAdmin } from "@/services/authService";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  function handleLogout() {
    logoutAdmin();
    router.replace("/admin/login");
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-pet-cream text-pet-ink lg:flex">
        {/* Desktop: permanent sidebar. Mobile: compact header + drawer. The
            drawer and sidebar render from the same navigation config. */}
        <Suspense fallback={<AdminChromeFallback />}>
          <AdminChrome onLogout={handleLogout} />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-semibold">
              Early launch operations workspace — payments are reviewed manually
              in this phase. Changes here update order, tag, and profile status
              for owners.
            </p>
          </div>
          {children}
        </main>
      </div>
    </AdminGuard>
  );
}

// Static placeholder so the page keeps its shape while useSearchParams
// resolves during static rendering.
function AdminChromeFallback() {
  return (
    <>
      <div aria-hidden="true" className="min-h-16 border-b border-[#1f315f] bg-pet-ink lg:hidden" />
      <aside aria-hidden="true" className="hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:w-72 lg:shrink-0 lg:border-r lg:border-[#1f315f] lg:bg-pet-ink" />
    </>
  );
}

function AdminChrome({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navScope, setNavScope] = useState(`${pathname}${search}`);

  // Any navigation closes the drawer so it never lingers over a new page
  // (render-phase adjustment, same pattern as the admin table selection reset).
  if (navScope !== `${pathname}${search}`) {
    setNavScope(`${pathname}${search}`);
    setDrawerOpen(false);
  }

  return (
    <>
      <MobileAdminHeader
        currentLabel={activeAdminNavLabel(pathname, search)}
        onOpenNavigation={() => setDrawerOpen(true)}
      />
      {drawerOpen ? (
        <MobileAdminDrawer
          onClose={() => setDrawerOpen(false)}
          onLogout={onLogout}
          pathname={pathname}
          search={search}
        />
      ) : null}
      <DesktopAdminSidebar onLogout={onLogout} pathname={pathname} search={search} />
    </>
  );
}

function MobileAdminHeader({
  currentLabel,
  onOpenNavigation,
}: {
  currentLabel: string;
  onOpenNavigation: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#1f315f] bg-pet-ink px-4 py-3 text-white lg:hidden">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <Link className="flex min-w-0 items-center gap-2.5" href="/admin">
          <BrandLogo markOnly className="h-9 w-9 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black">MyPetLink Admin</span>
            <span className="block truncate text-xs font-semibold text-[#b7c7e8]">
              {currentLabel}
            </span>
          </span>
        </Link>
        <button
          aria-label="Open admin navigation"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#405589] text-white transition hover:bg-[#1d3166]"
          onClick={onOpenNavigation}
          type="button"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}

// Slide-in navigation panel. Rendered only while open, so nothing here is
// keyboard-reachable when closed. useModalDialogFocus supplies the focus
// trap, Escape handling, body scroll lock, background inerting, and focus
// restoration to the hamburger button.
function MobileAdminDrawer({
  pathname,
  search,
  onClose,
  onLogout,
}: {
  pathname: string;
  search: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useModalDialogFocus({
    dialogRef: panelRef,
    initialFocusRef: closeRef,
    onEscape: onClose,
  });

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-label="Admin navigation"
      aria-modal="true"
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
    >
      <button
        aria-label="Close admin navigation"
        className="absolute inset-0 bg-[#0d1b3d]/60"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col overflow-y-auto bg-pet-ink px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-white shadow-2xl"
        ref={panelRef}
      >
        <div className="flex items-center justify-between gap-3">
          <Link className="flex items-center gap-2.5" href="/admin" onClick={onClose}>
            <BrandLogo markOnly className="h-9 w-9" />
            <span className="text-sm font-black">MyPetLink Admin</span>
          </Link>
          <button
            aria-label="Close admin navigation"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#405589] text-white transition hover:bg-[#1d3166]"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <AdminNavSections onNavigate={onClose} pathname={pathname} search={search} />
        <LogoutButton onLogout={onLogout} />
      </div>
    </div>,
    document.body
  );
}

function DesktopAdminSidebar({
  pathname,
  search,
  onLogout,
}: {
  pathname: string;
  search: string;
  onLogout: () => void;
}) {
  const collapsed = useSyncExternalStore(
    subscribeAdminSidebarCollapsed,
    getAdminSidebarCollapsed,
    getServerAdminSidebarCollapsed
  );

  return (
    <aside
      className={`hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-[#1f315f] lg:bg-pet-ink lg:text-white ${
        collapsed ? "lg:w-20 lg:px-2 lg:py-5" : "lg:w-72 lg:p-5"
      }`}
    >
      <Link
        href="/admin"
        className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}
        title={collapsed ? "MyPetLink Admin" : undefined}
      >
        <BrandLogo markOnly className="h-11 w-11 shrink-0" />
        {collapsed ? (
          <span className="sr-only">MyPetLink Admin</span>
        ) : (
          <span>
            <span className="block text-lg font-black">MyPetLink Admin</span>
            <span className="text-xs font-semibold text-[#b7c7e8]">
              Operations portal
            </span>
          </span>
        )}
      </Link>
      <AdminNavSections pathname={pathname} search={search} railed={collapsed} />
      <SidebarCollapseToggle
        collapsed={collapsed}
        onToggle={() => setAdminSidebarCollapsed(!collapsed)}
      />
      <LogoutButton collapsed={collapsed} onLogout={onLogout} />
    </aside>
  );
}

function SidebarCollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <button
      aria-expanded={!collapsed}
      aria-label={label}
      className={`mt-4 inline-flex min-h-11 items-center rounded-full border border-[#405589] text-sm font-bold text-[#d8e4ff] transition hover:bg-[#1d3166] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7aa2ff] ${
        collapsed ? "w-full justify-center px-2 py-2.5" : "w-full justify-center gap-2 px-4 py-2.5"
      }`}
      onClick={onToggle}
      title={label}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? "" : "rotate-180"}`}
        name="chevron"
      />
      {collapsed ? null : "Collapse"}
    </button>
  );
}

function AdminNavSections({
  pathname,
  search,
  onNavigate,
  railed = false,
}: {
  pathname: string;
  search: string;
  onNavigate?: () => void;
  /** Icon-only desktop rail. The mobile drawer never uses this. */
  railed?: boolean;
}) {
  const stored = useSyncExternalStore(
    subscribeAdminNavSections,
    getAdminNavSections,
    getServerAdminNavSections
  );
  const activeGroupId = activeAdminNavGroupId(pathname, search);

  return (
    <nav
      aria-label="Admin sections"
      className={`mt-6 grid flex-1 content-start ${railed ? "gap-3" : "gap-5"}`}
    >
      {visibleAdminNavGroups().map((group) => {
        // A rail has no room for headings, so every item stays reachable.
        const open = railed || isAdminNavGroupOpen(group, activeGroupId, stored);
        const sectionId = `admin-nav-section-${group.id}`;

        return (
          <div key={group.id}>
            {group.label && !railed ? (
              <button
                aria-controls={sectionId}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-1.5 text-left text-[0.65rem] font-extrabold uppercase tracking-wider text-[#8fa3d4] transition hover:bg-[#1d3166] hover:text-[#d8e4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7aa2ff]"
                onClick={() => setAdminNavSectionOpen(group.id, !open)}
                type="button"
              >
                <span>{group.label}</span>
                <Icon
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                  name="chevron"
                />
              </button>
            ) : null}
            {group.label && !railed ? (
              <span className="sr-only" id={`${sectionId}-hint`}>
                {open ? `${group.label} section expanded` : `${group.label} section collapsed`}
              </span>
            ) : null}
            {open ? (
              <ul className="grid gap-1" id={sectionId}>
                {group.items.map((item) => {
                  const active = isAdminNavItemActive(item, pathname, search);

                  return (
                    <li key={item.href}>
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex min-h-11 items-center rounded-2xl text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7aa2ff] ${
                          railed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"
                        } ${
                          active
                            ? "bg-white text-pet-ink"
                            : "text-[#d8e4ff] hover:bg-[#1d3166] hover:text-white"
                        }`}
                        href={item.href}
                        onClick={onNavigate}
                        title={railed ? item.label : undefined}
                      >
                        <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                        {railed ? (
                          <>
                            <span className="sr-only">{item.label}</span>
                            {/* Tooltip on hover and on keyboard focus, so the
                                rail is not mouse-only. */}
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-lg bg-pet-ink px-2.5 py-1.5 text-xs font-bold text-white shadow-lg ring-1 ring-[#405589] group-hover:block group-focus-visible:block"
                            >
                              {item.label}
                            </span>
                          </>
                        ) : (
                          item.label
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function LogoutButton({
  onLogout,
  collapsed = false,
}: {
  onLogout: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      className={`mt-6 inline-flex w-full items-center justify-center rounded-full border border-[#405589] text-sm font-bold text-[#d8e4ff] transition hover:bg-[#1d3166] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7aa2ff] ${
        collapsed ? "px-2 py-3" : "gap-2 px-4 py-3"
      }`}
      onClick={onLogout}
      title={collapsed ? "Logout" : undefined}
      type="button"
    >
      <Icon name="logout" className="h-4 w-4 shrink-0" />
      {collapsed ? <span className="sr-only">Logout</span> : "Logout"}
    </button>
  );
}
