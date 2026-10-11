import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSeoRouteRule,
  indexableRecordEntries,
  seoIndexingFor,
  seoRouteRules,
  sitemapEntries,
  type SeoIndexing,
} from "@/lib/seoRoutes";
import { indexableSamplePublicCode } from "@/data/publicSample";

const appRoot = join(process.cwd(), "src", "app");
const publicRoot = join(process.cwd(), "public");

/** Every App Router page as a route pattern: `src/app/q/[safetyCode]/page.tsx` → `/q/[safetyCode]`. */
function appPageRoutes(directory = appRoot): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      routes.push(...appPageRoutes(path));
    } else if (entry === "page.tsx") {
      const route = relative(appRoot, directory).split(sep).join("/");
      routes.push(route ? `/${route}` : "/");
    }
  }
  return routes;
}

/** A concrete URL path for a route pattern, for matching against `_headers`. */
function samplePath(route: string) {
  return route.replace(/\[[^\]]+\]/g, "sample-value");
}

type HeaderRule = { pattern: string; robots: string | undefined };

function headerRules(): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const raw of readFileSync(join(publicRoot, "_headers"), "utf8").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), robots: undefined };
      rules.push(current);
      continue;
    }
    const [name, ...value] = line.trim().split(":");
    if (current && name.toLowerCase() === "x-robots-tag") {
      current.robots = value.join(":").trim();
    }
  }
  return rules;
}

/** Cloudflare `_headers` matching: `*` is a greedy splat, everything else literal. */
function headerPatternMatches(pattern: string, path: string) {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(path);
}

const expectedHeader: Record<Exclude<SeoIndexing, "index">, string> = {
  "noindex-follow": "noindex, follow",
  "noindex-nofollow": "noindex, nofollow",
};

describe("every route has a search-engine policy", () => {
  it("classifies every page in src/app", () => {
    const unclassified = appPageRoutes().filter((route) => !findSeoRouteRule(route));

    // A new page must be added to seoRoutes.ts before it can ship.
    expect(unclassified).toEqual([]);
  });

  it("names no route twice and no rule for a page that does not exist", () => {
    const routes = new Set(appPageRoutes());
    const names = seoRouteRules.map((rule) => rule.route);

    expect(new Set(names).size).toBe(names.length);
    for (const rule of seoRouteRules) {
      const exists =
        routes.has(rule.route) ||
        (rule.includeDescendants &&
          [...routes].some((route) => route.startsWith(`${rule.route}/`)));
      expect(exists, `${rule.route} has no page`).toBe(true);
    }
  });

  it("refuses to answer for a route nobody classified", () => {
    expect(() => seoIndexingFor("/not-a-real-route")).toThrow(/No SEO route rule/);
  });
});

describe("finder, private and shared routes stay out of search", () => {
  const expectations: Array<[string, SeoIndexing]> = [
    // Finder Safety Profile and Smart Tag entry (QR, NFC, legacy printed tags).
    ["/q/[safetyCode]", "noindex-follow"],
    ["/n/[tagCode]", "noindex-follow"],
    ["/t/[tagCode]", "noindex-follow"],
    ["/activate/[tagCode]", "noindex-follow"],
    // Shared by their owners, never search results.
    ["/p/[slug]", "noindex-follow"],
    ["/u/[handle]", "noindex-follow"],
    ["/u/[handle]/followers", "noindex-nofollow"],
    ["/u/[handle]/following", "noindex-nofollow"],
    ["/moments/[momentId]", "noindex-follow"],
    ["/search", "noindex-follow"],
    // Sign-in, Owner Portal, orders and payment proof, account pages.
    ["/login", "noindex-nofollow"],
    ["/dashboard", "noindex-nofollow"],
    ["/pets", "noindex-nofollow"],
    ["/pets/new", "noindex-nofollow"],
    ["/pets/[id]", "noindex-nofollow"],
    ["/pets/[id]/tags/order", "noindex-nofollow"],
    ["/records", "noindex-nofollow"],
    ["/moments", "noindex-nofollow"],
    ["/tags", "noindex-nofollow"],
    ["/tags/order", "noindex-nofollow"],
    ["/orders", "noindex-nofollow"],
    ["/orders/view", "noindex-nofollow"],
    ["/settings", "noindex-nofollow"],
    ["/community/profile", "noindex-nofollow"],
    ["/community/profile/edit", "noindex-nofollow"],
    ["/feed", "noindex-nofollow"],
    ["/notifications", "noindex-nofollow"],
    // Admin Portal, including its sign-in page and every module.
    ["/admin", "noindex-nofollow"],
    ["/admin/login", "noindex-nofollow"],
    ["/admin/orders", "noindex-nofollow"],
    ["/admin/payment-proofs", "noindex-nofollow"],
    ["/admin/tag-inventory", "noindex-nofollow"],
  ];

  it.each(expectations)("%s is %s", (route, indexing) => {
    expect(seoIndexingFor(route)).toBe(indexing);
  });

  it("lists only the approved sample among individual records", () => {
    expect(indexableRecordEntries.map((entry) => entry.path)).toEqual([
      `/p/topu-${indexableSamplePublicCode}`,
    ]);
  });
});

describe("the sitemap comes from the route table", () => {
  it("lists exactly the indexable routes plus the approved sample", () => {
    const indexable = seoRouteRules
      .filter((rule) => rule.indexing === "index")
      .map((rule) => rule.route);

    expect(sitemapEntries.map((entry) => entry.path)).toEqual([
      ...indexable,
      ...indexableRecordEntries.map((entry) => entry.path),
    ]);
  });

  it("dates every indexable route", () => {
    for (const rule of seoRouteRules.filter((item) => item.indexing === "index")) {
      expect(rule.lastModified, rule.route).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("response headers follow the route table", () => {
  const rules = headerRules();

  it("sends X-Robots-Tag for every statically served noindex page", () => {
    for (const route of appPageRoutes()) {
      const rule = findSeoRouteRule(route)!;
      if (rule.servedBy !== "static" || rule.indexing === "index") continue;
      // Explore and Where to Buy are noindex only in some flag configurations,
      // so their robots meta tag carries the policy rather than a fixed header.
      if (route === "/explore" || route === "/where-to-buy") continue;

      const path = samplePath(route);
      const matching = rules.filter((header) => headerPatternMatches(header.pattern, path));
      expect(matching.length, `${route} has no _headers rule`).toBeGreaterThan(0);
      for (const header of matching) {
        expect(header.robots, `${header.pattern} for ${route}`).toBe(
          expectedHeader[rule.indexing]
        );
      }
    }
  });

  it("never sends a noindex header to an indexable page", () => {
    for (const rule of seoRouteRules.filter((item) => item.indexing === "index")) {
      const path = samplePath(rule.route);
      expect(
        rules.filter((header) => headerPatternMatches(header.pattern, path)),
        rule.route
      ).toEqual([]);
    }
    for (const entry of indexableRecordEntries) {
      expect(rules.filter((header) => headerPatternMatches(header.pattern, entry.path))).toEqual([]);
    }
  });

  it("keeps edge-served routes on Pages Functions, which set their own header", () => {
    // Cloudflare does not apply _headers to Function responses, so an edge
    // route must be claimed in _routes.json — otherwise it would be a static
    // page with no X-Robots-Tag at all.
    const claimed = (
      JSON.parse(readFileSync(join(publicRoot, "_routes.json"), "utf8")) as {
        include: string[];
      }
    ).include;

    for (const rule of seoRouteRules.filter((item) => item.servedBy === "edge")) {
      const path = samplePath(rule.route);
      expect(
        claimed.some((pattern) => headerPatternMatches(pattern, path)),
        `${rule.route} is not claimed by a Pages Function`
      ).toBe(true);
    }
  });

  it("keeps the header file within Cloudflare's limits", () => {
    expect(rules.length).toBeLessThanOrEqual(100);
  });
});
