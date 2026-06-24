import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetMomentForm } from "@/components/portal/PetMomentForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetById } from "@/services/petService";

type NewMomentPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Add Pet Moment",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function NewMomentPage({ params }: NewMomentPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Add moment"
        title={`Save a moment for ${pet.data.name}`}
        description="Add a memory, milestone, photo placeholder, or short video placeholder."
      />

      <PetMomentForm pet={pet.data} />
    </AppLayout>
  );
}
