import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { PageHeader } from "@/components/ui/PageHeader";
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

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Smart tags"
        title="MyPetLink Smart Tags"
        description="Manage current tags, pending orders, replacements, inactive tags, and archived tag history."
      />

      <TagManagementPanel
        initialOrders={orders.data}
        initialTags={tags.data}
        pets={pets.data}
      />
    </AppLayout>
  );
}
