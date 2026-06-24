import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetById } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";

type RecordsPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Pet Records",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function RecordsPage({ params }: RecordsPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const records = await getPetRecords(pet.data.id);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Care Records"
        title={`${pet.data.name}'s health and care history`}
        description="Keep vaccines, deworming, grooming, vet visits, medication, and allergy notes in one place."
      />

      <RecordsManager petId={pet.data.id} initialRecords={records.data} />
    </AppLayout>
  );
}
