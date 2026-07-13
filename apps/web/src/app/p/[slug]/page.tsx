import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSharePetProfile } from "@/components/marketing/PublicSharePetProfile";
import { staticPublicPetParams } from "@/data/staticRouteParams";
import { parsePublicProfileParam } from "@/lib/routes";
import { isPublicProfileShareable } from "@/lib/publicProfileSocial";
import {
  createPublicProfileMetadata,
  createUnavailablePublicProfileMetadata,
  isSearchIndexableSample,
} from "@/lib/seo";
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
  try {
    const profile = await getPublicPetProfileByPublicCode(publicCode);
    if (!profile.data || !isPublicProfileShareable(profile.data)) {
      return createUnavailablePublicProfileMetadata();
    }

    return createPublicProfileMetadata({
      profile: profile.data,
      isSearchSample: isSearchIndexableSample(profile.data.publicCode),
    });
  } catch {
    return createUnavailablePublicProfileMetadata();
  }
}

export default async function PublicPetPage({ params }: PublicPetPageProps) {
  const { slug } = await params;
  const { publicCode } = parsePublicProfileParam(slug);
  const profile = await getPublicPetProfileByPublicCode(publicCode);

  if (!profile.data || !isPublicProfileShareable(profile.data)) {
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
