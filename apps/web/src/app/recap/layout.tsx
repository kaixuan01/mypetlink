import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = privatePageMetadata;

export default function RecapSeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
