import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import {
  getPublicProfileSocialDescription,
  getPublicProfileSocialImagePath,
  getPublicProfileSocialTitle,
  isPublicProfileShareable,
  publicProfileSocialImageContentType,
  publicProfileSocialImageSize,
} from "@/lib/publicProfileSocial";
import { marketingRoutes, samplePet } from "@/lib/routes";
import { seoIndexingFor, sitemapEntries, type SeoIndexing } from "@/lib/seoRoutes";
import type { PublicPetProfile } from "@/types";

export const privateRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};

export const directAccessRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
  googleBot: {
    index: false,
    follow: true,
  },
};

// Rich-result directives for pages we want eligible in Google Search.
const richIndexDirectives = {
  index: true,
  follow: true,
  "max-image-preview": "large",
  "max-snippet": -1,
  "max-video-preview": -1,
} as const;

// Environment-safe indexing rule. Production is indexable **by default** so a
// production deploy can never accidentally inherit a preview "noindex" (the
// original bug was a global noindex baked into the layout). A preview / staging
// deployment opts OUT by setting `NEXT_PUBLIC_NOINDEX=true` in that environment
// only; production leaves it unset.
export function buildIndexableRobots(
  previewNoindex: boolean
): NonNullable<Metadata["robots"]> {
  if (previewNoindex) {
    return privateRobots;
  }

  return {
    ...richIndexDirectives,
    googleBot: { ...richIndexDirectives },
  };
}

export const indexableRobots: NonNullable<Metadata["robots"]> =
  buildIndexableRobots(process.env.NEXT_PUBLIC_NOINDEX === "true");

export const privatePageMetadata: Metadata = {
  robots: privateRobots,
};

export const directAccessPageMetadata: Metadata = {
  robots: directAccessRobots,
};

export type MarketingMetadataInput = {
  path: string;
  title: string;
  description: string;
  socialImage?: {
    path: string;
    alt: string;
  };
};

export function canonicalUrl(path = "/") {
  return new URL(path, `${siteConfig.url}/`).toString();
}

export function robotsForIndexing(
  indexing: SeoIndexing
): NonNullable<Metadata["robots"]> {
  switch (indexing) {
    case "index":
      return indexableRobots;
    case "noindex-follow":
      return directAccessRobots;
    case "noindex-nofollow":
      return privateRobots;
  }
}

export function createMarketingMetadata({
  path,
  title,
  description,
  socialImage,
}: MarketingMetadataInput): Metadata {
  const canonical = canonicalUrl(path);
  const imageUrl = canonicalUrl(socialImage?.path ?? "/og-image.png");
  const imageAlt = socialImage?.alt ?? "MyPetLink pet safety and share profile";

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    // The route table decides, so a page whose sitemap entry depends on a
    // release flag (Explore, Where to Buy) can never be listed while noindex
    // or indexed while unlisted.
    robots: robotsForIndexing(seoIndexingFor(path)),
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: siteConfig.productName,
      locale: "en_MY",
      type: "website",
      images: [
        {
          url: imageUrl,
          secureUrl: imageUrl,
          type: "image/png",
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: imageUrl, alt: imageAlt }],
    },
  };
}

export function createPublicProfileMetadata({
  profile,
  isSearchSample,
}: {
  profile: PublicPetProfile;
  isSearchSample: boolean;
}): Metadata {
  if (!isPublicProfileShareable(profile)) {
    return createUnavailablePublicProfileMetadata();
  }

  const title = getPublicProfileSocialTitle(profile.name);
  const description = getPublicProfileSocialDescription(profile.name);
  const canonical = canonicalUrl(profile.publicProfilePath);
  const socialImage = canonicalUrl(getPublicProfileSocialImagePath(profile));
  const imageAlt = `${profile.name}'s profile on MyPetLink`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: isSearchSample ? indexableRobots : directAccessRobots,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: siteConfig.productName,
      locale: "en_MY",
      type: "website",
      images: [
        {
          url: socialImage,
          secureUrl: socialImage,
          type: publicProfileSocialImageContentType,
          width: publicProfileSocialImageSize.width,
          height: publicProfileSocialImageSize.height,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: socialImage, alt: imageAlt }],
    },
  };
}

export function createUnavailablePublicProfileMetadata(): Metadata {
  const title = "Share Profile Unavailable | MyPetLink";
  const description =
    "This MyPetLink Share Profile is unavailable or is not shared publicly.";
  const image = canonicalUrl("/og-image.png");

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl(marketingRoutes.petProfile) },
    robots: directAccessRobots,
    openGraph: {
      title,
      description,
      url: canonicalUrl(marketingRoutes.petProfile),
      siteName: siteConfig.productName,
      locale: "en_MY",
      type: "website",
      images: [
        {
          url: image,
          secureUrl: image,
          type: "image/png",
          width: 1200,
          height: 630,
          alt: "MyPetLink Share Profile",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: "MyPetLink Share Profile" }],
    },
  };
}

export function isSearchIndexableSample(publicCode: string) {
  return publicCode.toLowerCase() === samplePet.publicCode.toLowerCase();
}

// The sitemap is derived from the route table in `seoRoutes.ts`, which owns the
// stable content dates. Never replace them with build time: an unchanged
// deployment must not make every URL look updated.
export const indexableSitemapEntries = sitemapEntries;

export const indexableSitemapPaths = indexableSitemapEntries.map(
  ({ path }) => path
);

export const homepageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteConfig.url}/#organization`,
      name: siteConfig.productName,
      legalName: siteConfig.companyName,
      url: canonicalUrl("/"),
      // The square brand mark (the same file the web app manifest uses).
      // Google expects an organisation logo to work as a square; the
      // horizontal wordmark is 540x140.
      logo: {
        "@type": "ImageObject",
        url: canonicalUrl("/app-icon-512.png"),
        width: 512,
        height: 512,
      },
      // The support address already published in the site footer and the
      // Privacy Notice. No phone number, street address or social profile is
      // listed: none is published as an official MyPetLink contact.
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: siteConfig.supportEmail,
        areaServed: "MY",
        availableLanguage: ["en"],
      },
      areaServed: {
        "@type": "Country",
        name: siteConfig.country,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteConfig.url}/#website`,
      name: siteConfig.productName,
      url: canonicalUrl("/"),
      publisher: {
        "@id": `${siteConfig.url}/#organization`,
      },
      inLanguage: "en-MY",
    },
  ],
} as const;
