import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPets } from "@/services/petService";
import { getAllTags } from "@/services/tagService";

export const metadata: Metadata = {
  title: "MyPetLink Smart Tags",
};

export default async function TagsPage() {
  const [pets, tags] = await Promise.all([getPets(), getAllTags()]);
  const firstPet = pets.data[0];

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Smart tags"
        title="MyPetLink Smart Tags"
        description="Manage active tags, pending orders, replacements, and lost tags."
        action={
          firstPet ? (
            <CTAButton href={`/pets/${firstPet.id}/tags/order`} icon="tag">
              Order Physical Tag
            </CTAButton>
          ) : null
        }
      />

      <TagManagementPanel initialTags={tags.data} pets={pets.data} />
    </AppLayout>
  );
}
