import type { Metadata } from "next";
import { TagFinderView } from "@/components/portal/TagFinderView";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import {
  loadingTitle,
  qrSafetyPageTitle,
  tagNotFoundTitle,
} from "@/lib/pageTitles";
import { canonicalUrl, directAccessRobots } from "@/lib/seo";
import { tagNfcPath } from "@/lib/routes";
import { getFinderState } from "@/services/tagService";
import type { FinderResult } from "@/types";

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
  const result = await getFinderState(tagCode, "nfc");

  return {
    title: finderMetadataTitle(result),
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
  const result = await getFinderState(tagCode, "nfc");

  return (
    <TagFinderView initialResult={result} source="nfc" tagCode={tagCode} />
  );
}

function finderMetadataTitle(result: FinderResult) {
  switch (result.state) {
    case "active":
      return qrSafetyPageTitle(result.profile.name);
    case "nfc-activation-required":
      return "Scan the QR code to activate";
    case "not-found":
      return loadingTitle;
    case "inactive":
      return "Inactive MyPetLink Tag";
    default:
      return tagNotFoundTitle;
  }
}
