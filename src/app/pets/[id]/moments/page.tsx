import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { PetSwitcher } from "@/components/portal/PetSwitcher";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetMoments } from "@/services/momentService";
import { getPetById, getPets } from "@/services/petService";

type MomentsPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Pet Moments",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function MomentsPage({ params }: MomentsPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const moments = await getPetMoments(pet.data.id);
  const pets = await getPets();

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Pet moments"
        title={`${pet.data.name}'s memories`}
        description="Save photos, short videos, milestones, funny moments, and life notes for this pet."
      />

      <PetSwitcher activePetId={pet.data.id} pets={pets.data} section="moments" />

      <PetMomentsManager pet={pet.data} initialMoments={moments.data} />
    </AppLayout>
  );
}
