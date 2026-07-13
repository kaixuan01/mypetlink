import type { MetadataRoute } from "next";
import { canonicalUrl, indexableSitemapPaths } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return indexableSitemapPaths.map((path) => ({
    url: canonicalUrl(path),
  }));
}
