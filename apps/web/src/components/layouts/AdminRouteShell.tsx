"use client";

import { usePathname } from "next/navigation";
import { AdminLayout } from "@/components/layouts/AdminLayout";

export function AdminRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return children;
  }

  return <AdminLayout>{children}</AdminLayout>;
}
