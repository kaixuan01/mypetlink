import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetProfileForm } from "@/components/portal/PetProfileForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetById } from "@/services/petService";

type EditPetPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Edit Pet",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function EditPetPage({ params }: EditPetPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Edit pet"
        title={`Update ${pet.data.name}'s details`}
        description="Keep public profile details, photos, contact options, and safety notes clear for anyone who may find your pet."
      />
      <PetProfileForm initialPet={pet.data} mode="edit" />
    </AppLayout>
  );
}
