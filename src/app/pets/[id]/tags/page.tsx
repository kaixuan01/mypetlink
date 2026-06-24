import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetById, getPets } from "@/services/petService";
import { getPetTags } from "@/services/tagService";

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

  const [pets, tags] = await Promise.all([getPets(), getPetTags(pet.data.id)]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Smart tags"
        title={`${pet.data.name}'s MyPetLink Smart Tags`}
        description="One pet can have multiple tags for different collars, replacements, or upgrades."
        action={
          <CTAButton href={`/pets/${pet.data.id}/tags/order`} icon="tag">
            Order Physical Tag
          </CTAButton>
        }
      />

      <TagManagementPanel
        initialTags={tags.data}
        petId={pet.data.id}
        pets={pets.data}
      />
    </AppLayout>
  );
}
