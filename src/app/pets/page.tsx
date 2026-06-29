import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PlanAwareAddPetButton } from "@/components/portal/PlanAwareAddPetButton";
import { PetList } from "@/components/portal/PetList";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPets } from "@/services/petService";
import { getAllTags, getOrders } from "@/services/tagService";

export const metadata: Metadata = {
  title: "My Pets",
};

export default async function PetsPage() {
  const [pets, tags, orders] = await Promise.all([
    getPets(),
    getAllTags(),
    getOrders(),
  ]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="My pets"
        title="Your pets at a glance"
        description="A quick overview of every pet. Tap Manage to open a pet's records, moments, smart tags, and settings."
        action={<PlanAwareAddPetButton />}
      />
      <PetList
        initialOrders={orders.data}
        initialPets={pets.data}
        initialTags={tags.data}
      />
    </AppLayout>
  );
}
