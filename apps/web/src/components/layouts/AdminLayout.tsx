"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminGuard } from "@/components/auth/AdminGuard";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { logoutAdmin } from "@/services/authService";

const adminNav: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Overview", icon: "home" },
  { href: "/admin/orders", label: "Orders", icon: "record" },
  { href: "/admin/payment-proofs", label: "Payment Proofs", icon: "shield" },
  { href: "/admin/tags", label: "Smart Tags", icon: "tag" },
  { href: "/admin/tag-inventory", label: "Tag Inventory", icon: "copy" },
  { href: "/admin/pets", label: "Pets", icon: "pets" },
  { href: "/admin/users", label: "Owners", icon: "users" },
  { href: "/admin/qr-profiles", label: "QR Profiles", icon: "qr" },
  { href: "/admin/plans", label: "Plans", icon: "plans" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logoutAdmin();
    router.replace("/admin/login");
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-pet-cream text-pet-ink lg:flex">
        <aside className="border-r border-[#1f315f] bg-pet-ink p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:w-72">
          <Link href="/admin" className="flex items-center gap-3">
            <BrandLogo markOnly className="h-11 w-11" />
            <span>
              <span className="block text-lg font-black">MyPetLink Admin</span>
              <span className="text-xs font-semibold text-[#b7c7e8]">
                Operations portal
              </span>
            </span>
          </Link>
          <nav className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {adminNav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                    active
                      ? "bg-white text-pet-ink"
                      : "text-[#d8e4ff] hover:bg-[#1d3166] hover:text-white"
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
          <button
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#405589] px-4 py-3 text-sm font-bold text-[#d8e4ff] transition hover:bg-[#1d3166] hover:text-white"
            onClick={handleLogout}
            type="button"
          >
            <Icon name="logout" className="h-4 w-4" />
            Logout
          </button>
        </aside>
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
