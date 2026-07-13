import type { Metadata } from "next";
import { AdminRouteShell } from "@/components/layouts/AdminRouteShell";
import { privatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = privatePageMetadata;

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AdminRouteShell>{children}</AdminRouteShell>;
}
