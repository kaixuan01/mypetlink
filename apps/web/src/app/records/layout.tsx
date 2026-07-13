import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = privatePageMetadata;

export default function RecordsSeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
