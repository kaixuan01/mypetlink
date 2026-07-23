import type { Metadata } from "next";
import { TagFinderView } from "@/components/portal/TagFinderView";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import {
  loadingTitle,
} from "@/lib/pageTitles";
import { canonicalUrl, directAccessRobots } from "@/lib/seo";
import { tagNfcPath } from "@/lib/routes";

type NfcFinderPageProps = {
  params: Promise<{ tagCode: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticTagCodeParams();
}

export async function generateMetadata({
  params,
}: NfcFinderPageProps): Promise<Metadata> {
  const { tagCode } = await params;

  return {
    // Static metadata generation must not be counted as a physical tag view.
    title: loadingTitle,
    alternates: {
      canonical: canonicalUrl(tagNfcPath(tagCode)),
    },
    robots: directAccessRobots,
  };
}

export default async function NfcFinderPage({
  params,
}: NfcFinderPageProps) {
  const { tagCode } = await params;

  return (
    <TagFinderView
      initialResult={{ state: "not-found", tagCode }}
      source="nfc"
      tagCode={tagCode}
    />
  );
}
