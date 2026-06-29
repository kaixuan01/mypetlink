import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetById, getPets } from "@/services/petService";
import { getOrders, getPetTags } from "@/services/tagService";

type PetTagsPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "MyPetLink Smart Tags",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function PetTagsPage({ params }: PetTagsPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }
  const currentPet = pet.data;

  const [pets, tags, orders] = await Promise.all([
    getPets(),
    getPetTags(currentPet.id),
    getOrders(),
  ]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Smart tags"
        title={`${currentPet.name}'s MyPetLink Smart Tags`}
        description="One pet can have multiple tags for different collars, replacements, or upgrades."
      />

      <TagManagementPanel
        initialOrders={orders.data.filter((order) => order.petId === currentPet.id)}
        initialTags={tags.data}
        petId={currentPet.id}
        pets={pets.data}
      />
    </AppLayout>
  );
}
