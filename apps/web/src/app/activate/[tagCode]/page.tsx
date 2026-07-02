import type { Metadata } from "next";
import { TagActivationFlow } from "@/components/portal/TagActivationFlow";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import { getFinderState } from "@/services/tagService";

type ActivatePageProps = {
  params: Promise<{ tagCode: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticTagCodeParams();
}

export const metadata: Metadata = {
  title: "Activate your MyPetLink Tag",
};

export default async function ActivatePage({ params }: ActivatePageProps) {
  const { tagCode } = await params;
  const result = await getFinderState(tagCode);

  return <TagActivationFlow initialResult={result} tagCode={tagCode} />;
}
