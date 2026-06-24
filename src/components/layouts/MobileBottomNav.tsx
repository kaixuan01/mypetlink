"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/pets", label: "Pets", icon: "pets" },
  { href: "/pets/pet_milo/moments", label: "Moments", icon: "heart" },
  { href: "/tags", label: "Tags", icon: "tag" },
  { href: "/orders", label: "Orders", icon: "record" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-full border border-pet-border bg-white/95 p-2 shadow-xl shadow-[#0d1b3d]/10 backdrop-blur lg:hidden">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/pets" &&
            (pathname === "/pets" ||
              pathname === "/pets/new" ||
              /^\/pets\/[^/]+(\/edit|\/qr|\/records|\/timeline)?$/.test(
                pathname
              ))) ||
          (item.href.endsWith("/moments") &&
            /^\/pets\/[^/]+\/moments/.test(pathname)) ||
          (item.href === "/tags" &&
            (pathname === "/tags" || /^\/pets\/[^/]+\/tags/.test(pathname)));
        return (
          <Link
            className={`grid place-items-center gap-1 rounded-full px-2 py-2 text-[11px] font-bold ${
              active ? "bg-[#e8f3ff] text-pet-teal" : "text-pet-muted"
            }`}
            href={item.href}
            key={item.href}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
