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

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: NewMomentPageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data ? `Add a moment for ${pet.data.name}` : "Add Pet Moment",
  };
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
        description="Add a memory, milestone, photo moment, or short clip for your pet."
      />

      <PetMomentForm pet={pet.data} />
    </AppLayout>
  );
}
