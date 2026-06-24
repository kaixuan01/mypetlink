import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFinderProfile } from "@/components/marketing/PublicFinderProfile";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import { getFinderPetProfile } from "@/services/tagService";

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
  const profile = await getFinderPetProfile(tagCode);

  return {
    title: profile.data ? `Found ${profile.data.name}?` : "Pet Safety Page",
  };
}

export default async function FinderPage({ params }: FinderPageProps) {
  const { tagCode } = await params;
  const profile = await getFinderPetProfile(tagCode);

  if (!profile.data) {
    notFound();
  }

  return (
    <main className="brand-blue-section min-h-screen px-4 py-6 sm:px-6">
      <PublicFinderProfile pet={profile.data} />
    </main>
  );
}
