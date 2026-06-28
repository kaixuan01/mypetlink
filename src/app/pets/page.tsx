import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetCard } from "@/components/portal/PetCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ownerRoutes } from "@/lib/routes";
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

  const tagsByPet = new Map<string, typeof tags.data>();
  for (const tag of tags.data) {
    if (!tag.petId) {
      continue;
    }
    tagsByPet.set(tag.petId, [...(tagsByPet.get(tag.petId) ?? []), tag]);
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="My pets"
        title="Your pets at a glance"
        description="A quick overview of every pet. Tap Manage to open a pet's records, moments, smart tags, and settings."
        action={
          <CTAButton href={ownerRoutes.petNew} icon="plus">
            Add Pet
          </CTAButton>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {pets.data.length ? (
          pets.data.map((pet) => {
            return (
              <PetCard
                key={pet.id}
                orders={orders.data.filter((order) => order.petId === pet.id)}
                pet={pet}
                tags={tagsByPet.get(pet.id) ?? []}
              />
            );
          })
        ) : (
          <EmptyState
            title="No pets yet"
            description="Create your first profile to generate a safe QR page."
            actionHref={ownerRoutes.petNew}
            actionLabel="Add Pet"
          />
        )}
      </div>
    </AppLayout>
  );
}
