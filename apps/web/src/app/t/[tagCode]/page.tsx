import type { Metadata } from "next";
import { TagFinderView } from "@/components/portal/TagFinderView";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import {
  loadingTitle,
} from "@/lib/pageTitles";
import { tagPath } from "@/lib/routes";
import { canonicalUrl, directAccessRobots } from "@/lib/seo";

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

  return {
    // Static metadata generation must not be counted as a physical tag view.
    title: loadingTitle,
    alternates: {
      canonical: canonicalUrl(tagPath(tagCode)),
    },
    robots: directAccessRobots,
  };
}

export default async function FinderPage({ params }: FinderPageProps) {
  const { tagCode } = await params;

  return (
    <TagFinderView
      initialResult={{ state: "not-found", tagCode }}
      source="legacy"
      tagCode={tagCode}
    />
  );
}
