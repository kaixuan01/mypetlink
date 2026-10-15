import { socialEnabled } from "@/lib/features";
import { marketingRoutes, samplePet, socialRoutes } from "@/lib/routes";

/**
 * The search-engine policy for every route in the app, in one place.
 *
 * Every `page.tsx` under `src/app` must be covered by exactly one rule here —
 * `seoRoutes.test.ts` walks the filesystem and fails on a route nobody
 * classified, so a new page cannot ship with whatever robots tag it happened to
 * inherit. The sitemap, the robots metadata of the marketing pages, the
 * `public/_headers` rules and the build verifier all read this table rather
 * than keeping their own lists.
 *
 * - `index` — a public page we want in search results. Listed in the sitemap.
 * - `noindex-follow` — reachable by anyone with the link, never a search
 *   result, but its links may be followed (finder pages, shared profiles).
 * - `noindex-nofollow` — sign-in, Owner Portal, Admin Portal and account pages.
 *
 * `servedBy` records which layer owns the response headers. Cloudflare applies
 * `public/_headers` to static assets only; it does not apply them to responses
 * produced by Pages Functions, so routes claimed in `public/_routes.json` set
 * their own `X-Robots-Tag` in `edge/`.
 */
export type SeoIndexing = "index" | "noindex-follow" | "noindex-nofollow";

export type SeoRouteRule = {
  /** App Router pattern, e.g. `/q/[safetyCode]`. */
  route: string;
  indexing: SeoIndexing;
  /** The rule also covers every route below this one (the Admin Portal). */
  includeDescendants?: boolean;
  servedBy: "static" | "edge";
  /**
   * The date this page's visible content last changed. Required for every
   * `index` rule; it is what the sitemap publishes as `lastmod`. Update it only
   * when the copy or the facts on the page change — never to build time.
   */
  lastModified?: string;
};

/**
 * Individual records that are indexable even though their route is not.
 *
 * Only the approved Topu sample Share Profile. Its indexability is decided at
 * the edge by `indexableSamplePublicCode` in `src/data/publicSample.ts`; this
 * entry is what lists it in the sitemap. Owner Share Profiles, Community
 * Profiles and Moments are never listed here.
 */
export const indexableRecordEntries = [
  { path: samplePet.publicProfilePath, lastModified: "2026-07-23" },
] as const;

const conditionalIndexing = (indexable: boolean): SeoIndexing =>
  indexable ? "index" : "noindex-follow";

export const seoRouteRules: readonly SeoRouteRule[] = [
  // Marketing and legal pages.
  { route: marketingRoutes.home, indexing: "index", servedBy: "static", lastModified: "2026-10-10" },
  { route: marketingRoutes.pricing, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  { route: marketingRoutes.howItWorks, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  { route: marketingRoutes.smartPetTags, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  { route: marketingRoutes.petProfile, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  { route: marketingRoutes.safetyProfile, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  { route: marketingRoutes.sample, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  { route: marketingRoutes.privacy, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  { route: marketingRoutes.terms, indexing: "index", servedBy: "static", lastModified: "2026-09-22" },
  // The generic partner directory is always discoverable, including its empty
  // state. Listing data is fetched privately at runtime, never embedded here.
  {
    route: marketingRoutes.whereToBuy,
    indexing: "index",
    servedBy: "static",
    lastModified: "2026-10-13",
  },
  // The Community doorway. Indexed only while Community is offered; the
  // profiles and Moments behind it never are (see app/explore/page.tsx).
  {
    route: socialRoutes.explore,
    indexing: conditionalIndexing(socialEnabled),
    servedBy: "static",
    lastModified: "2026-10-10",
  },

  // Finder and tag entry. Per-pet safety URLs: never a search result, whatever
  // the Share Profile chooses.
  { route: "/q/[safetyCode]", indexing: "noindex-follow", servedBy: "edge" },
  { route: "/n/[tagCode]", indexing: "noindex-follow", servedBy: "edge" },
  { route: "/t/[tagCode]", indexing: "noindex-follow", servedBy: "edge" },
  { route: "/activate/[tagCode]", indexing: "noindex-follow", servedBy: "static" },

  // Shared, owner-controlled pages. Reachable by link, kept out of search.
  { route: "/p/[slug]", indexing: "noindex-follow", servedBy: "edge" },
  { route: "/u/[handle]", indexing: "noindex-follow", servedBy: "edge" },
  { route: "/u/[handle]/followers", indexing: "noindex-nofollow", servedBy: "edge" },
  { route: "/u/[handle]/following", indexing: "noindex-nofollow", servedBy: "edge" },
  { route: "/moments/[momentId]", indexing: "noindex-follow", servedBy: "edge" },
  { route: socialRoutes.search, indexing: "noindex-follow", servedBy: "static" },

  // Sign-in, Owner Portal and account pages.
  { route: "/login", indexing: "noindex-nofollow", servedBy: "static" },
  { route: "/dashboard", indexing: "noindex-nofollow", servedBy: "static" },
  { route: "/pets", indexing: "noindex-nofollow", servedBy: "static", includeDescendants: true },
  { route: "/records", indexing: "noindex-nofollow", servedBy: "static" },
  { route: "/moments", indexing: "noindex-nofollow", servedBy: "static" },
  { route: "/tags", indexing: "noindex-nofollow", servedBy: "static", includeDescendants: true },
  { route: "/orders", indexing: "noindex-nofollow", servedBy: "static", includeDescendants: true },
  { route: "/settings", indexing: "noindex-nofollow", servedBy: "static" },
  { route: "/community", indexing: "noindex-nofollow", servedBy: "static", includeDescendants: true },
  { route: socialRoutes.feed, indexing: "noindex-nofollow", servedBy: "static" },
  { route: socialRoutes.notifications, indexing: "noindex-nofollow", servedBy: "static" },

  // Admin Portal, including its sign-in page.
  { route: "/admin", indexing: "noindex-nofollow", servedBy: "static", includeDescendants: true },
];

/** The rule that governs an App Router route pattern, if any. */
export function findSeoRouteRule(route: string) {
  return (
    seoRouteRules.find((rule) => rule.route === route) ??
    seoRouteRules.find(
      (rule) => rule.includeDescendants && route.startsWith(`${rule.route}/`)
    )
  );
}

export function seoIndexingFor(route: string): SeoIndexing {
  const rule = findSeoRouteRule(route);
  if (!rule) {
    throw new Error(`No SEO route rule covers ${route}. Add one to seoRoutes.ts.`);
  }
  return rule.indexing;
}

/** Every URL the sitemap lists, with the date its content last changed. */
export const sitemapEntries: readonly { path: string; lastModified: string }[] = [
  ...seoRouteRules
    .filter((rule) => rule.indexing === "index")
    .map((rule) => {
      if (!rule.lastModified) {
        throw new Error(`Indexable route ${rule.route} needs a lastModified date.`);
      }
      return { path: rule.route, lastModified: rule.lastModified };
    }),
  ...indexableRecordEntries,
];
