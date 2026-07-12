"use client";

import { usePathname } from "next/navigation";
import { AdminLayout } from "@/components/layouts/AdminLayout";

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return children;
  }

  return <AdminLayout>{children}</AdminLayout>;
}
