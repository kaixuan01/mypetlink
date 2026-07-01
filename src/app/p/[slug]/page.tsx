import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSharePetProfile } from "@/components/marketing/PublicSharePetProfile";
import { staticPublicPetParams } from "@/data/staticRouteParams";
import {
  loadingTitle,
  publicPetProfileDocumentTitle,
} from "@/lib/pageTitles";
import { parsePublicProfileParam } from "@/lib/routes";
import { getPublicPetMoments } from "@/services/momentService";
import { getPublicPetProfileByPublicCode } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";

type PublicPetPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPublicPetParams();
}

export async function generateMetadata({
  params,
}: PublicPetPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { publicCode } = parsePublicProfileParam(slug);
  const profile = await getPublicPetProfileByPublicCode(publicCode);

  return {
    title: profile.data
      ? { absolute: publicPetProfileDocumentTitle(profile.data.name) }
      : loadingTitle,
  };
}

export default async function PublicPetPage({ params }: PublicPetPageProps) {
  const { slug } = await params;
  const { publicCode } = parsePublicProfileParam(slug);
  const profile = await getPublicPetProfileByPublicCode(publicCode);

  if (!profile.data) {
    notFound();
  }

  const moments = await getPublicPetMoments(profile.data.id);
  const records = await getPetRecords(profile.data.id);

  return (
    <main className="min-h-screen bg-pet-cream">
      <PublicSharePetProfile
        initialMoments={moments.data}
        initialProfile={profile.data}
        initialRecords={records.data}
        initialLostMode={profile.data.lostModeEnabled}
      />
    </main>
  );
}
