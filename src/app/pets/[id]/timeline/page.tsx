import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetTimeline } from "@/components/portal/PetTimeline";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetMoments } from "@/services/momentService";
import { getPetById } from "@/services/petService";

type TimelinePageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: TimelinePageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data ? `${pet.data.name} Timeline` : "Pet Timeline",
  };
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const moments = await getPetMoments(pet.data.id);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Life timeline"
        title={`${pet.data.name}'s story`}
        description="A gentle timeline of milestones, memories, care days, and everyday notes."
      />

      <PetTimeline pet={pet.data} initialMoments={moments.data} />
    </AppLayout>
  );
}
