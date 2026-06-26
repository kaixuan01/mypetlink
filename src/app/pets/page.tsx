import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetCard } from "@/components/portal/PetCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPets } from "@/services/petService";
import { getAllTags } from "@/services/tagService";
import type { TagStatus } from "@/types";

export const metadata: Metadata = {
  title: "My Pets",
};

export default async function PetsPage() {
  const pets = await getPets();
  const tags = await getAllTags();

  const tagSummary = new Map<string, { count: number; status: TagStatus }>();
  for (const tag of tags.data) {
    if (!tag.petId) {
      continue;
    }
    const current = tagSummary.get(tag.petId);
    const count = (current?.count ?? 0) + 1;
    // Prefer an Active tag as the representative status for the card.
    const status =
      current?.status === "Active" ? current.status : tag.status;
    tagSummary.set(tag.petId, { count, status });
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="My pets"
        title="Your pets at a glance"
        description="A quick overview of every pet. Tap Manage to open a pet's records, moments, smart tags, and settings."
        action={
          <CTAButton href="/pets/new" icon="plus">
            Add Pet
          </CTAButton>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {pets.data.length ? (
          pets.data.map((pet) => {
            const summary = tagSummary.get(pet.id);
            return (
              <PetCard
                key={pet.id}
                pet={pet}
                tagCount={summary?.count ?? 0}
                tagStatus={summary?.status}
              />
            );
          })
        ) : (
          <EmptyState
            title="No pets yet"
            description="Create your first profile to generate a safe QR page."
            actionHref="/pets/new"
            actionLabel="Add Pet"
          />
        )}
      </div>
    </AppLayout>
  );
}
