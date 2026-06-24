import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSharePetProfile } from "@/components/marketing/PublicSharePetProfile";
import { staticPublicPetParams } from "@/data/staticRouteParams";
import { getPublicPetMoments } from "@/services/momentService";
import { getPublicPetProfile } from "@/services/petService";
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
  const profile = await getPublicPetProfile(slug);

  return {
    title: profile.data ? `${profile.data.name}'s Profile` : "Pet Profile",
  };
}

export default async function PublicPetPage({ params }: PublicPetPageProps) {
  const { slug } = await params;
  const profile = await getPublicPetProfile(slug);

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
      />
    </main>
  );
}
