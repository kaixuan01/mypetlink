import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetQrSafetyManager } from "@/components/portal/PetQrSafetyManager";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetById } from "@/services/petService";
import { getPetTags } from "@/services/tagService";

type PetQrPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "QR Safety Page",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function PetQrPage({ params }: PetQrPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const tags = await getPetTags(pet.data.id);

  return (
    <AppLayout>
      <PetQrSafetyManager initialPet={pet.data} initialTags={tags.data} />
    </AppLayout>
  );
}
