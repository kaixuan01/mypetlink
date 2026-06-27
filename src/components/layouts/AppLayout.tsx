"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { logoutOwner } from "@/services/authService";

const navItems: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/pets", label: "My Pets", icon: "pets" },
  { href: "/records", label: "Records", icon: "record" },
  { href: "/moments", label: "Moments", icon: "heart" },
  { href: "/tags", label: "Smart Tags", icon: "tag" },
  { href: "/orders", label: "Orders", icon: "record" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function isActiveNav(href: string) {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    if (href === "/settings") {
      return pathname === "/settings";
    }

    if (href === "/records") {
      return (
        pathname === "/records" || /^\/pets\/[^/]+\/records$/.test(pathname)
      );
    }

    if (href === "/moments") {
      return (
        pathname === "/moments" ||
        /^\/pets\/[^/]+\/moments(\/new)?$/.test(pathname)
      );
    }

    if (href === "/tags") {
      return pathname === "/tags" || /^\/pets\/[^/]+\/tags/.test(pathname);
    }

    if (href === "/orders") {
      return pathname === "/orders";
    }

    if (href === "/pets") {
      return (
        pathname === "/pets" ||
        pathname === "/pets/new" ||
        /^\/pets\/[^/]+$/.test(pathname) ||
        /^\/pets\/[^/]+\/edit$/.test(pathname) ||
        /^\/pets\/[^/]+\/timeline$/.test(pathname)
      );
    }

    return pathname === href;
  }

  function handleLogout() {
    logoutOwner();
    router.replace("/");
  }

  return (
    <AuthGuard>
      <div className="min-h-screen overflow-x-hidden bg-pet-cream pb-[calc(7rem+env(safe-area-inset-bottom))] lg:flex lg:pb-0">
        <aside className="hidden w-72 shrink-0 border-r border-pet-border bg-white/90 p-5 shadow-xl shadow-[#0d1b3d]/5 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo markOnly className="h-12 w-12" />
            <span>
              <span className="block text-lg font-black text-pet-ink">
                MyPetLink
              </span>
              <span className="text-xs font-semibold text-pet-muted">
                Owner portal
              </span>
            </span>
          </Link>

          <div className="brand-paw-dots mt-7 rounded-[1.5rem] border border-pet-border bg-pet-cream p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-pet-ink">Aina Rahman</p>
                <p className="text-xs text-pet-muted">Pet owner account</p>
              </div>
            </div>
          </div>

          <nav className="mt-6 grid gap-2">
            {navItems.map((item) => {
              const active = isActiveNav(item.href);
              return (
                <Link
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                    active
                      ? "bg-[#e8f3ff] text-pet-teal"
                      : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto grid gap-3">
            <CTAButton href="/pets/new" icon="plus" fullWidth>
              Add Pet
            </CTAButton>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-muted transition hover:text-pet-ink"
              onClick={handleLogout}
              type="button"
            >
              <Icon name="logout" className="h-4 w-4" />
              Logout
            </button>
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
              <CTAButton href="/pets/new" icon="plus" variant="secondary">
                Add Pet
              </CTAButton>
            </div>
          </header>
          <main className="mx-auto min-w-0 w-full max-w-7xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>

        <MobileBottomNav />
      </div>
    </AuthGuard>
  );
}
