import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetProfileForm } from "@/components/portal/PetProfileForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { loadingTitle, ownerPetPageTitle } from "@/lib/pageTitles";
import { getPetById } from "@/services/petService";

type EditPetPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: EditPetPageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data ? ownerPetPageTitle("edit", pet.data.name) : loadingTitle,
  };
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
        title={`Edit ${pet.data.name}`}
        description="Update profile, photos, privacy, and safety settings."
      />
      <PetProfileForm initialPet={pet.data} mode="edit" />
    </AppLayout>
  );
}
