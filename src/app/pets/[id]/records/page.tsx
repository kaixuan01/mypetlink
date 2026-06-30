import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { PetSwitcher } from "@/components/portal/PetSwitcher";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetById, getPets } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";

type RecordsPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: RecordsPageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data ? `${pet.data.name} Care Records` : "Pet Records",
  };
}

export default async function RecordsPage({ params }: RecordsPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const records = await getPetRecords(pet.data.id);
  const pets = await getPets();

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Care Records"
        title={`${pet.data.name}'s health and care history`}
        description="Keep vaccines, deworming, grooming, vet visits, medication, and allergy notes in one place."
      />

      <PetSwitcher activePetId={pet.data.id} pets={pets.data} section="records" />

      <RecordsManager petId={pet.data.id} initialRecords={records.data} />
    </AppLayout>
  );
}
