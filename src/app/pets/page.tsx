import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetCard } from "@/components/portal/PetCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPets } from "@/services/petService";

export const metadata: Metadata = {
  title: "My Pets",
};

export default async function PetsPage() {
  const pets = await getPets();

  return (
    <AppLayout>
      <PageHeader
        eyebrow="My pets"
        title="Every pet gets a safer profile"
        description="Manage your pets, QR profiles, emergency contacts, and care records in one place."
        action={
          <CTAButton href="/pets/new" icon="plus">
            Add Pet
          </CTAButton>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {pets.data.length ? (
          pets.data.map((pet) => <PetCard key={pet.id} pet={pet} />)
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
