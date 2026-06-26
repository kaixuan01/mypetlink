import type { Metadata } from "next";
import { TagFinderView } from "@/components/portal/TagFinderView";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import { getFinderState } from "@/services/tagService";

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
    title:
      result.state === "active"
        ? `Found ${result.profile.name}?`
        : "MyPetLink Safety Page",
  };
}

export default async function FinderPage({ params }: FinderPageProps) {
  const { tagCode } = await params;
  const result = await getFinderState(tagCode);

  return <TagFinderView initialResult={result} tagCode={tagCode} />;
}
