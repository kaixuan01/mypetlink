import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";
import { getAllTags, getOrders } from "@/services/tagService";

export const metadata: Metadata = {
  title: "MyPetLink Smart Tags",
};

export default async function TagsPage() {
  const [pets, tags, orders] = await Promise.all([
    getPets(),
    getAllTags(),
    getOrders(),
  ]);
  const firstPet = pets.data[0];

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Smart tags"
        title="MyPetLink Smart Tags"
        description="Manage current tags, pending orders, replacements, inactive tags, and archived tag history."
        action={
          firstPet ? (
            <CTAButton href={ownerRoutes.petTagOrder(firstPet.id)} icon="tag">
              Order Physical Tag
            </CTAButton>
          ) : null
        }
      />

      <TagManagementPanel
        initialOrders={orders.data}
        initialTags={tags.data}
        pets={pets.data}
      />
    </AppLayout>
  );
}
