import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { marketingRoutes, samplePet } from "@/lib/routes";

export const indexableRobots: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
  },
};

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
  name,
  path,
  isSearchSample,
}: {
  name: string;
  path: string;
  isSearchSample: boolean;
}): Metadata {
  const title = `${name}'s Pet Profile | MyPetLink Malaysia`;
  const description = isSearchSample
    ? `Meet ${name} on MyPetLink and see how a shareable pet profile brings pet details, memories, and safe owner-approved information together.`
    : `${name}'s owner-approved public pet profile on MyPetLink.`;
  const canonical = canonicalUrl(path);

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
      images: [canonicalUrl("/og-image.png")],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [canonicalUrl("/og-image.png")],
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
