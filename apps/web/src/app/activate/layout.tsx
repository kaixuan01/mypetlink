import type { Metadata } from "next";
import { directAccessPageMetadata } from "@/lib/seo";

export const metadata: Metadata = directAccessPageMetadata;

export default function ActivateSeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
