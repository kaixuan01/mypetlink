"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AdminGuard } from "@/components/auth/AdminGuard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import {
  activeAdminNavLabel,
  isAdminNavItemActive,
  visibleAdminNavGroups,
} from "@/lib/adminNavigation";
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
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-[#1f315f] lg:bg-pet-ink lg:p-5 lg:text-white">
      <Link href="/admin" className="flex items-center gap-3">
        <BrandLogo markOnly className="h-11 w-11" />
        <span>
          <span className="block text-lg font-black">MyPetLink Admin</span>
          <span className="text-xs font-semibold text-[#b7c7e8]">
            Operations portal
          </span>
        </span>
      </Link>
      <AdminNavSections pathname={pathname} search={search} />
      <LogoutButton onLogout={onLogout} />
    </aside>
  );
}

function AdminNavSections({
  pathname,
  search,
  onNavigate,
}: {
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Admin sections" className="mt-6 grid flex-1 content-start gap-5">
      {visibleAdminNavGroups().map((group) => (
        <div key={group.label ?? "overview"}>
          {group.label ? (
            <p className="px-4 pb-1.5 text-[0.65rem] font-extrabold uppercase tracking-wider text-[#8fa3d4]">
              {group.label}
            </p>
          ) : null}
          <ul className="grid gap-1">
            {group.items.map((item) => {
              const active = isAdminNavItemActive(item, pathname, search);

              return (
                <li key={item.href}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
                      active
                        ? "bg-white text-pet-ink"
                        : "text-[#d8e4ff] hover:bg-[#1d3166] hover:text-white"
                    }`}
                    href={item.href}
                    onClick={onNavigate}
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function LogoutButton({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#405589] px-4 py-3 text-sm font-bold text-[#d8e4ff] transition hover:bg-[#1d3166] hover:text-white"
      onClick={onLogout}
      type="button"
    >
      <Icon name="logout" className="h-4 w-4" />
      Logout
    </button>
  );
}
