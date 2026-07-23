import { describe, expect, it } from "vitest";
import { metadata as homeMetadata } from "@/app/page";
import { metadata as pricingMetadata } from "@/app/pricing/page";
import { metadata as smartTagsMetadata } from "@/app/smart-pet-tags/page";
import { metadata as loginMetadata } from "@/app/login/page";
import { metadata as dashboardMetadata } from "@/app/dashboard/layout";
import { metadata as petsMetadata } from "@/app/pets/layout";
import { metadata as adminMetadata } from "@/app/admin/layout";
import { generateMetadata as generateQrMetadata } from "@/app/q/[safetyCode]/page";
import { generateMetadata as generatePublicProfileMetadata } from "@/app/p/[slug]/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { marketingRoutes, samplePet } from "@/lib/routes";
import {
  buildIndexableRobots,
  canonicalUrl,
  createPublicProfileMetadata,
  createUnavailablePublicProfileMetadata,
  homepageStructuredData,
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

describe("SEO route policy", () => {
  it("keeps the homepage, pricing, and smart-tag guide indexable", () => {
    for (const metadata of [homeMetadata, pricingMetadata, smartTagsMetadata]) {
      expect(robotsPolicy(metadata).index).toBe(true);
      expect(robotsPolicy(metadata).follow).toBe(true);
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
        absolute: "Pet Profile Unavailable | MyPetLink",
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
      absolute: "Pet Profile Unavailable | MyPetLink",
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
      "View Topu's public profile, memories, and important safety information."
    );
    expect(openGraph.title).toBe("Meet Topu | MyPetLink");
    expect(openGraph.description).toBe(
      "View Topu's public profile, memories, and important safety information."
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
      "View Topu's public profile, memories, and important safety information."
    );
    expect(twitter.images?.[0]).toEqual({
      url: image?.url,
      alt: "Topu's profile on MyPetLink",
    });
    expect(image?.url).not.toContain("og-image.png");
  });
});

describe("canonical metadata", () => {
  it("uses the preferred HTTPS host for public canonical URLs", () => {
    expect(canonical(homeMetadata)).toBe("https://mypetlink.com.my/");
    expect(canonical(pricingMetadata)).toBe("https://mypetlink.com.my/pricing");
    expect(canonical(smartTagsMetadata)).toBe(
      "https://mypetlink.com.my/smart-pet-tags"
    );
    expect(canonicalUrl("/pet-profile")).toBe(
      "https://mypetlink.com.my/pet-profile"
    );
  });

  it("never emits a pages.dev canonical", () => {
    const canonicals = [homeMetadata, pricingMetadata, smartTagsMetadata].map(canonical);
    expect(canonicals.every((value) => value?.startsWith("https://mypetlink.com.my"))).toBe(true);
    expect(canonicals.some((value) => value?.includes("pages.dev"))).toBe(false);
  });

  it("gives major marketing pages unique titles and descriptions", () => {
    const pages = [homeMetadata, pricingMetadata, smartTagsMetadata];
    const titles = pages.map((page) => JSON.stringify(page.title));
    const descriptions = pages.map((page) => page.description);
    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descriptions).size).toBe(pages.length);
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
});

describe("robots and sitemap", () => {
  it("allows rendering crawls and references the production sitemap", () => {
    const value = robots();
    expect(value.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(value.sitemap).toBe("https://mypetlink.com.my/sitemap.xml");
  });

  it("contains only approved canonical public URLs", () => {
    const urls = sitemap().map((entry) => entry.url);
    const expected = indexableSitemapPaths.map((path) => canonicalUrl(path));

    expect(urls).toEqual(expected);
    expect(urls).toContain(canonicalUrl(marketingRoutes.home));
    expect(urls).toContain(canonicalUrl(samplePet.publicProfilePath));
    expect(urls.some((url) => /\/(admin|dashboard|pets|q|orders|settings)(\/|$)/.test(url))).toBe(false);
    expect(urls.some((url) => url.includes("pages.dev"))).toBe(false);
  });
});
