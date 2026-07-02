import type { Metadata } from "next";
import { TagFinderView } from "@/components/portal/TagFinderView";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import {
  loadingTitle,
  tagNotFoundTitle,
  tagScanPageTitle,
} from "@/lib/pageTitles";
import { getFinderState } from "@/services/tagService";
import type { FinderResult } from "@/types";

type FinderPageProps = {
  params: Promise<{ tagCode: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticTagCodeParams();
}

export async function generateMetadata({
  params,
}: FinderPageProps): Promise<Metadata> {
  const { tagCode } = await params;
  const result = await getFinderState(tagCode);

  return {
    title: finderMetadataTitle(result),
  };
}

export default async function FinderPage({ params }: FinderPageProps) {
  const { tagCode } = await params;
  const result = await getFinderState(tagCode);

  return <TagFinderView initialResult={result} tagCode={tagCode} />;
}

function finderMetadataTitle(result: FinderResult) {
  switch (result.state) {
    case "active":
      return tagScanPageTitle(result.profile.name);
    case "not-found":
      return loadingTitle;
    case "unassigned":
      return "Activate MyPetLink Tag";
    case "pending":
      return "MyPetLink Tag Pending";
    case "inactive":
      return "Inactive MyPetLink Tag";
    default:
      return tagNotFoundTitle;
  }
}
