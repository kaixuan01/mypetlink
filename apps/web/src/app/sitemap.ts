import type { MetadataRoute } from "next";
import { canonicalUrl, indexableSitemapEntries } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return indexableSitemapEntries.map(({ path, lastModified }) => ({
    url: canonicalUrl(path),
    lastModified,
  }));
}
