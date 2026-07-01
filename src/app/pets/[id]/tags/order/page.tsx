import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { TagOrderFlow } from "@/components/portal/TagOrderFlow";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { loadingTitle, ownerPetPageTitle } from "@/lib/pageTitles";
import { getPetById, getPets } from "@/services/petService";

type PetTagOrderPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: PetTagOrderPageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data
      ? ownerPetPageTitle("tag-order", pet.data.name)
      : loadingTitle,
  };
}

export default async function PetTagOrderPage({ params }: PetTagOrderPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const selectedPet = pet.data;
  const pets = await getPets();
  const orderPets = pets.data.some((item) => item.id === selectedPet.id)
    ? pets.data
    : [selectedPet, ...pets.data];

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Order physical tag"
        title={`Order a tag for ${selectedPet.name}`}
        description="Choose a MyPetLink QR Pet Tag or MyPetLink QR + NFC Smart Tag after creating your pet profile."
      />

      <TagOrderFlow
        initialTagType="MyPetLink QR Pet Tag"
        pets={orderPets}
        preselectedPetId={selectedPet.id}
      />
    </AppLayout>
  );
}
