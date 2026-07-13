import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import {
  getPublicProfileSocialImagePath,
  isPublicProfileShareable,
  publicProfileSocialImageContentType,
  publicProfileSocialImageSize,
} from "@/lib/publicProfileSocial";
import { marketingRoutes, samplePet } from "@/lib/routes";
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
};

export function canonicalUrl(path = "/") {
  return new URL(path, `${siteConfig.url}/`).toString();
}

export function createMarketingMetadata({
  path,
  title,
  description,
}: MarketingMetadataInput): Metadata {
  const canonical = canonicalUrl(path);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: indexableRobots,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: siteConfig.productName,
      locale: "en_MY",
      type: "website",
      images: [
        {
          url: canonicalUrl("/og-image.png"),
          width: 1200,
          height: 630,
          alt: "MyPetLink pet safety and share profile",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [canonicalUrl("/og-image.png")],
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

  const title = `Meet ${profile.name} | MyPetLink`;
  const description = `View ${profile.name}'s owner-approved pet profile, memories and safety information on MyPetLink.`;
  const openGraphDescription = `View ${profile.name}'s owner-approved pet profile, memories and safety information.`;
  const twitterDescription = `View ${profile.name}'s owner-approved pet profile on MyPetLink.`;
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
      description: openGraphDescription,
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
      description: twitterDescription,
      images: [{ url: socialImage, alt: imageAlt }],
    },
  };
}

export function createUnavailablePublicProfileMetadata(): Metadata {
  const title = "Pet Profile Unavailable | MyPetLink";
  const description =
    "This MyPetLink pet profile is unavailable or is not shared publicly.";
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
          alt: "MyPetLink pet profile",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: "MyPetLink pet profile" }],
    },
  };
}

export function isSearchIndexableSample(publicCode: string) {
  return publicCode.toLowerCase() === samplePet.publicCode.toLowerCase();
}

export const indexableSitemapPaths = [
  marketingRoutes.home,
  marketingRoutes.pricing,
  marketingRoutes.howItWorks,
  marketingRoutes.smartPetTags,
  marketingRoutes.petProfile,
  marketingRoutes.sample,
  marketingRoutes.privacy,
  marketingRoutes.terms,
  samplePet.publicProfilePath,
] as const;

export const homepageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteConfig.url}/#organization`,
      name: siteConfig.productName,
      legalName: siteConfig.companyName,
      url: canonicalUrl("/"),
      logo: canonicalUrl("/logo-horizontal.png"),
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
