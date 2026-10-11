import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { smartTagAddOn } from "@/lib/planLimits";
import { metadata as homeMetadata } from "@/app/page";
import { metadata as howItWorksMetadata } from "@/app/how-it-works/page";
import { metadata as petProfileMetadata } from "@/app/pet-profile/page";
import { metadata as pricingMetadata } from "@/app/pricing/page";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import { metadata as sampleMetadata } from "@/app/sample/page";
import { metadata as smartTagsMetadata } from "@/app/smart-pet-tags/page";
import { metadata as termsMetadata } from "@/app/terms/page";
import { metadata as whereToBuyMetadata } from "@/app/where-to-buy/page";
import { metadata as safetyProfileMetadata } from "@/app/safety-profile/page";
import { metadata as exploreMetadata } from "@/app/explore/page";
import { metadata as loginMetadata } from "@/app/login/page";
import { metadata as dashboardMetadata } from "@/app/dashboard/layout";
import { metadata as petsMetadata } from "@/app/pets/layout";
import { metadata as adminMetadata } from "@/app/admin/layout";
import { generateMetadata as generateQrMetadata } from "@/app/q/[safetyCode]/page";
import { generateMetadata as generatePublicProfileMetadata } from "@/app/p/[slug]/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { socialEnabled } from "@/lib/features";
import { publicCommerceAvailability } from "@/lib/publicCommerceAvailability";
import { marketingRoutes, samplePet, socialRoutes } from "@/lib/routes";
import { seoIndexingFor, seoRouteRules } from "@/lib/seoRoutes";
import {
  buildIndexableRobots,
  canonicalUrl,
  createPublicProfileMetadata,
  createUnavailablePublicProfileMetadata,
  homepageStructuredData,
  indexableSitemapEntries,
  indexableSitemapPaths,
} from "@/lib/seo";
import { toPublicProfile } from "@/services/petService";

function robotsPolicy(metadata: { robots?: unknown }) {
  return metadata.robots as {
    index?: boolean;
    follow?: boolean;
  };
}

function canonical(metadata: { alternates?: unknown }) {
  return (metadata.alternates as { canonical?: string } | undefined)?.canonical;
}

// Every page built with createMarketingMetadata.
const marketingPageCases = [
  [marketingRoutes.home, homeMetadata],
  [marketingRoutes.howItWorks, howItWorksMetadata],
  [marketingRoutes.petProfile, petProfileMetadata],
  [marketingRoutes.pricing, pricingMetadata],
  [marketingRoutes.privacy, privacyMetadata],
  [marketingRoutes.sample, sampleMetadata],
  [marketingRoutes.smartPetTags, smartTagsMetadata],
  [marketingRoutes.terms, termsMetadata],
  [marketingRoutes.safetyProfile, safetyProfileMetadata],
  [marketingRoutes.whereToBuy, whereToBuyMetadata],
  [socialRoutes.explore, exploreMetadata],
] as const;

describe("SEO route policy", () => {
  it("covers every indexable route of the route table with a metadata case", () => {
    // A new indexable page must be added here, so its metadata is checked.
    const covered = new Set(marketingPageCases.map(([path]) => path as string));
    const conditionallyIndexed: string[] = [marketingRoutes.whereToBuy, socialRoutes.explore];
    for (const rule of seoRouteRules) {
      if (rule.indexing === "index" || conditionallyIndexed.includes(rule.route)) {
        expect(covered.has(rule.route)).toBe(true);
      }
    }
  });

  it("gives every public marketing page the robots policy the route table assigns", () => {
    for (const [path, metadata] of marketingPageCases) {
      const indexable = seoIndexingFor(path) === "index";
      expect(robotsPolicy(metadata).index).toBe(indexable);
      // Even an unlisted marketing page lets crawlers follow its links.
      expect(robotsPolicy(metadata).follow).toBe(true);
      if (indexable) {
        expect(JSON.stringify(metadata).toLowerCase()).not.toContain("noindex");
      }
    }
  });

  it("indexes the always-on marketing pages in every flag configuration", () => {
    for (const path of [
      marketingRoutes.home,
      marketingRoutes.pricing,
      marketingRoutes.howItWorks,
      marketingRoutes.smartPetTags,
      marketingRoutes.petProfile,
      marketingRoutes.safetyProfile,
      marketingRoutes.sample,
      marketingRoutes.privacy,
      marketingRoutes.terms,
    ]) {
      expect(seoIndexingFor(path)).toBe("index");
    }
  });

  it("never emits noindex on the homepage and adds rich-result directives", () => {
    const robots = homeMetadata.robots as Record<string, unknown> & {
      googleBot?: Record<string, unknown>;
    };

    expect(robots.index).toBe(true);
    expect(robots.follow).toBe(true);
    expect(robots["max-image-preview"]).toBe("large");
    expect(robots["max-snippet"]).toBe(-1);
    expect(robots["max-video-preview"]).toBe(-1);
    expect(robots.googleBot?.index).toBe(true);
    expect(JSON.stringify(homeMetadata).toLowerCase()).not.toContain("noindex");
  });

  it("environment-safe indexing: production indexes, preview (NEXT_PUBLIC_NOINDEX) is noindex", () => {
    // Production default (flag off): indexable with rich directives.
    const production = buildIndexableRobots(false) as Record<string, unknown>;
    expect(production.index).toBe(true);
    expect(production.follow).toBe(true);
    expect(production["max-image-preview"]).toBe("large");

    // Preview/staging opt-out (flag on): noindex, nofollow.
    expect(robotsPolicy({ robots: buildIndexableRobots(true) }).index).toBe(false);
    expect(robotsPolicy({ robots: buildIndexableRobots(true) }).follow).toBe(
      false
    );
  });

  it("keeps login, Owner Portal, and Admin Portal pages noindex", () => {
    for (const metadata of [loginMetadata, dashboardMetadata, petsMetadata, adminMetadata]) {
      expect(robotsPolicy(metadata).index).toBe(false);
      expect(robotsPolicy(metadata).follow).toBe(false);
    }
  });

  it("indexes Where to Buy only while there is somewhere to buy", () => {
    expect(robotsPolicy(whereToBuyMetadata).index).toBe(
      publicCommerceAvailability.showWhereToBuy
    );
    expect(robotsPolicy(whereToBuyMetadata).follow).toBe(true);
  });

  it("indexes Explore only while Community is offered", () => {
    expect(robotsPolicy(exploreMetadata).index).toBe(socialEnabled);
    expect(robotsPolicy(exploreMetadata).follow).toBe(true);
  });

  it("keeps QR Safety routes noindex while allowing their links to be followed", async () => {
    const metadata = await generateQrMetadata({
      params: Promise.resolve({ safetyCode: samplePet.safetyCode }),
    });

    expect(robotsPolicy(metadata).index).toBe(false);
    expect(robotsPolicy(metadata).follow).toBe(true);
  });

  it("indexes only the approved Topu public profile sample", async () => {
    const topu = await generatePublicProfileMetadata({
      params: Promise.resolve({ slug: `topu-${samplePet.publicCode}` }),
    });
    const sampleProfile = toPublicProfile(samplePet);
    const normalProfile = createPublicProfileMetadata({
      profile: {
        ...sampleProfile,
        name: "Example Pet",
        publicCode: "example-code",
        publicProfilePath: "/p/example-pet-example-code",
      },
      isSearchSample: false,
    });

    expect(robotsPolicy(topu).index).toBe(true);
    expect(robotsPolicy(normalProfile).index).toBe(false);
    expect(robotsPolicy(normalProfile).follow).toBe(true);
  });

  it("uses generic noindex metadata for unavailable or archived profiles", () => {
    const unavailable = createUnavailablePublicProfileMetadata();
    const archived = createPublicProfileMetadata({
      profile: {
        ...toPublicProfile(samplePet),
        lifecycleStatus: "Archived",
      },
      isSearchSample: false,
    });

    for (const metadata of [unavailable, archived]) {
      expect(robotsPolicy(metadata).index).toBe(false);
      expect(metadata.title).toEqual({
        absolute: "Share Profile Unavailable | MyPetLink",
      });
      expect(JSON.stringify(metadata)).not.toContain(samplePet.name);
    }
  });

  it("does not expose pet details for an invalid or private public-profile slug", async () => {
    const metadata = await generatePublicProfileMetadata({
      params: Promise.resolve({ slug: "private-pet-not-public" }),
    });
    const serialized = JSON.stringify(metadata);

    expect(metadata.title).toEqual({
      absolute: "Share Profile Unavailable | MyPetLink",
    });
    expect(robotsPolicy(metadata).index).toBe(false);
    expect(serialized).not.toContain("private-pet-not-public");
  });
});

describe("public profile social metadata", () => {
  it("returns pet-specific Open Graph and Twitter metadata", () => {
    const metadata = createPublicProfileMetadata({
      profile: toPublicProfile(samplePet),
      isSearchSample: true,
    });
    const openGraph = metadata.openGraph as {
      description?: string;
      images?: Array<{
        alt?: string;
        height?: number;
        secureUrl?: string;
        type?: string;
        url?: string;
        width?: number;
      }>;
      title?: string;
      url?: string;
    };
    const twitter = metadata.twitter as {
      card?: string;
      description?: string;
      images?: Array<{ alt?: string; url?: string }>;
      title?: string;
    };
    const image = openGraph.images?.[0];

    expect(metadata.title).toEqual({ absolute: "Meet Topu | MyPetLink" });
    expect(metadata.description).toBe(
      "View Topu's Share Profile, Moments, and important safety information."
    );
    expect(openGraph.title).toBe("Meet Topu | MyPetLink");
    expect(openGraph.description).toBe(
      "View Topu's Share Profile, Moments, and important safety information."
    );
    expect(openGraph.url).toBe("https://mypetlink.com.my/p/topu-pnpr4ipnr6ppelnsn");
    expect(image?.url).toMatch(
      /^https:\/\/mypetlink\.com\.my\/social\/pets\/topu-pnpr4ipnr6ppelnsn\.jpg\?v=[a-z0-9]+$/
    );
    expect(image?.secureUrl).toBe(image?.url);
    expect(image?.type).toBe("image/jpeg");
    expect(image?.width).toBe(1200);
    expect(image?.height).toBe(630);
    expect(image?.alt).toBe("Topu's profile on MyPetLink");
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.title).toBe("Meet Topu | MyPetLink");
    expect(twitter.description).toBe(
      "View Topu's Share Profile, Moments, and important safety information."
    );
    expect(twitter.images?.[0]).toEqual({
      url: image?.url,
      alt: "Topu's profile on MyPetLink",
    });
    expect(image?.url).not.toContain("og-image.png");
  });
});

describe("canonical metadata", () => {
  it("uses a self-referencing preferred-host canonical on every marketing page", () => {
    for (const [path, metadata] of marketingPageCases) {
      expect(canonical(metadata)).toBe(canonicalUrl(path));
    }
  });

  it("never emits a pages.dev canonical", () => {
    const canonicals = marketingPageCases.map(([, metadata]) =>
      canonical(metadata)
    );
    expect(canonicals.every((value) => value?.startsWith("https://mypetlink.com.my"))).toBe(true);
    expect(canonicals.some((value) => value?.includes("pages.dev"))).toBe(false);
  });

  it("gives every marketing page a unique title and description", () => {
    const pages = marketingPageCases.map(([, metadata]) => metadata);
    const titles = pages.map((page) => JSON.stringify(page.title));
    const descriptions = pages.map((page) => page.description);
    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descriptions).size).toBe(pages.length);
    expect(descriptions.every((description) => Boolean(description))).toBe(true);
  });
});

describe("pricing social metadata", () => {
  it("uses dedicated pricing copy and imagery for Open Graph and Twitter", () => {
    const openGraph = pricingMetadata.openGraph as {
      description?: string;
      images?: Array<{
        alt?: string;
        height?: number;
        secureUrl?: string;
        type?: string;
        url?: string;
        width?: number;
      }>;
      title?: string;
    };
    const twitter = pricingMetadata.twitter as {
      description?: string;
      images?: Array<{ alt?: string; url?: string }>;
      title?: string;
    };
    const image = openGraph.images?.[0];
    const description =
      `Create your pet profile for free. Add the QR + NFC Smart Tag for ${smartTagAddOn.price} — a one-time purchase.`;
    const imageAlt =
      "MyPetLink pricing: free profile and the one-time QR plus NFC smart tag";

    expect(pricingMetadata.title).toEqual({
      absolute: "MyPetLink Pricing | Free Profile & Smart Tag",
    });
    expect(pricingMetadata.description).toBe(description);
    expect(openGraph.title).toBe("MyPetLink Pricing | Free Profile & Smart Tag");
    expect(openGraph.description).toBe(description);
    expect(image).toEqual({
      url: "https://mypetlink.com.my/pricing-og.png",
      secureUrl: "https://mypetlink.com.my/pricing-og.png",
      type: "image/png",
      width: 1200,
      height: 630,
      alt: imageAlt,
    });
    expect(twitter.title).toBe("MyPetLink Pricing | Free Profile & Smart Tag");
    expect(twitter.description).toBe(description);
    expect(twitter.images?.[0]).toEqual({
      url: "https://mypetlink.com.my/pricing-og.png",
      alt: imageAlt,
    });
  });

  it("leaves other marketing pages on the shared social image", () => {
    for (const [path, metadata] of marketingPageCases) {
      if (path === marketingRoutes.pricing) continue;

      expect(JSON.stringify(metadata.openGraph)).toContain(
        "https://mypetlink.com.my/og-image.png"
      );
    }
  });
});

describe("structured data", () => {
  it("is valid JSON and contains no fake review or rating claims", () => {
    const parsed = JSON.parse(JSON.stringify(homepageStructuredData));
    const serialized = JSON.stringify(parsed).toLowerCase();

    expect(parsed["@context"]).toBe("https://schema.org");
    expect(serialized).not.toContain("aggregaterating");
    expect(serialized).not.toContain("reviewcount");
    expect(serialized).not.toContain('"review"');
  });

  it("describes the organisation with only published facts", () => {
    const [organization, website] = homepageStructuredData["@graph"];

    expect(organization).toMatchObject({
      "@type": "Organization",
      "@id": "https://mypetlink.com.my/#organization",
      name: "MyPetLink",
      legalName: "GBB Software Solutions",
      url: "https://mypetlink.com.my/",
      logo: {
        "@type": "ImageObject",
        url: "https://mypetlink.com.my/app-icon-512.png",
        width: 512,
        height: 512,
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@mypetlink.com.my",
      },
    });
    // Nothing MyPetLink has not published: no street address, phone number,
    // social profiles, ratings or offers.
    for (const key of ["address", "telephone", "sameAs", "aggregateRating", "review", "offers"]) {
      expect(organization).not.toHaveProperty(key);
    }
    expect(website).toMatchObject({
      "@type": "WebSite",
      inLanguage: "en-MY",
      publisher: { "@id": "https://mypetlink.com.my/#organization" },
    });
    expect(website).not.toHaveProperty("potentialAction");
  });

  it("uses a square logo file that ships with the site", () => {
    const logo = readFileSync(join(process.cwd(), "public", "app-icon-512.png"));
    // PNG IHDR: width and height are big-endian at bytes 16 and 20.
    expect(logo.readUInt32BE(16)).toBe(512);
    expect(logo.readUInt32BE(20)).toBe(512);
  });

  it("does not describe the Smart Tag as a Product yet", () => {
    // Product/Offer markup waits for a product photo and the catalogue naming
    // decision (docs/seo/seo-audit.md, SEO-H4 and SEO-H5).
    expect(JSON.stringify(homepageStructuredData)).not.toMatch(/"Product"|"Offer"/);
  });
});

describe("robots and sitemap", () => {
  it("allows rendering crawls and references the production sitemap", () => {
    const value = robots();
    expect(value.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(value.sitemap).toBe("https://mypetlink.com.my/sitemap.xml");
  });

  it("contains only approved canonical public URLs", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    const expected = indexableSitemapPaths.map((path) => canonicalUrl(path));

    expect(urls).toEqual(expected);
    expect(urls).toContain(canonicalUrl(marketingRoutes.home));
    expect(urls).toContain(canonicalUrl(samplePet.publicProfilePath));
    // Flag-dependent entries follow the same rule as the page's robots tag.
    expect(urls.includes(canonicalUrl(marketingRoutes.whereToBuy))).toBe(
      publicCommerceAvailability.showWhereToBuy
    );
    expect(urls.includes(canonicalUrl(socialRoutes.explore))).toBe(socialEnabled);
    // Every listed path is one the route table indexes; the Topu sample is the
    // only listed record.
    for (const path of indexableSitemapPaths) {
      if (path === samplePet.publicProfilePath) continue;
      expect(seoIndexingFor(path)).toBe("index");
    }
    expect(
      urls.some((url) =>
        /^\/(admin|dashboard|login|pets|records|moments|tags|orders|settings|community|feed|notifications|search|activate|q|n|t|u)(\/|$)/.test(
          new URL(url).pathname
        )
      )
    ).toBe(false);
    expect(
      urls.filter((url) => new URL(url).pathname.startsWith("/p/"))
    ).toEqual([canonicalUrl(samplePet.publicProfilePath)]);
    expect(urls.some((url) => url.includes("pages.dev"))).toBe(false);
    expect(urls.some((url) => url.startsWith("http://"))).toBe(false);
    expect(urls.some((url) => url.includes("://www."))).toBe(false);
    expect(urls.some((url) => /:\/\/(api|media)\./.test(url))).toBe(false);
  });

  it("uses stable last-modified dates from real content changes", () => {
    const entries = sitemap();

    expect(entries).toHaveLength(indexableSitemapEntries.length);
    expect(entries.map((entry) => entry.lastModified)).toEqual(
      indexableSitemapEntries.map((entry) => entry.lastModified)
    );
    expect(
      entries.every(
        (entry) =>
          typeof entry.lastModified === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.lastModified)
      )
    ).toBe(true);
    // A date is a content fact, not the build time: none is in the future and
    // none predates the site.
    const today = new Date().toISOString().slice(0, 10);
    for (const entry of entries) {
      expect((entry.lastModified as string) <= today).toBe(true);
      expect((entry.lastModified as string) >= "2026-07-01").toBe(true);
    }
  });
});
