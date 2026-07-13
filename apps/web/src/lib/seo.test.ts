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
  canonicalUrl,
  createPublicProfileMetadata,
  homepageStructuredData,
  indexableSitemapPaths,
} from "@/lib/seo";

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
    const normalProfile = createPublicProfileMetadata({
      name: "Example Pet",
      path: "/p/example-pet-code",
      isSearchSample: false,
    });

    expect(robotsPolicy(topu).index).toBe(true);
    expect(robotsPolicy(normalProfile).index).toBe(false);
    expect(robotsPolicy(normalProfile).follow).toBe(true);
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
