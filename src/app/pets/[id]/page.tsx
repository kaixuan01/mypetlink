import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { ProfileAccessBadges } from "@/components/portal/ProfileAccessStatus";
import { PetManagementTabs } from "@/components/portal/PetManagementTabs";
import { CTAButton } from "@/components/ui/CTAButton";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { ownerRoutes } from "@/lib/routes";
import { getPetMoments } from "@/services/momentService";
import { getPetById } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getPetTags } from "@/services/tagService";

type PetDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: PetDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data ? `${pet.data.name} Profile` : "Pet Profile",
  };
}

export default async function PetDetailPage({ params }: PetDetailPageProps) {
  const { id } = await params;
  const petResponse = await getPetById(id);

  if (!petResponse.data) {
    notFound();
  }

  const pet = petResponse.data;
  const records = await getPetRecords(pet.id);
  const tags = await getPetTags(pet.id);
  const moments = await getPetMoments(pet.id);

  return (
    <AppLayout>
      <section className="brand-card mb-6 rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="sm:hidden">
              <PetAvatar pet={pet} size="md" />
            </span>
            <span className="hidden sm:block">
              <PetAvatar pet={pet} size="lg" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-pet-ink sm:text-3xl">
                {pet.name}
              </h1>
              <p className="mt-1 text-sm text-pet-muted">
                {pet.species} &middot; {pet.breed} &middot; {pet.ageLabel}
              </p>
            </div>
          </div>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            icon="settings"
            fullWidth
            className="sm:w-auto"
          >
            Edit Pet Details
          </CTAButton>
        </div>
        <ProfileAccessBadges
          className="mt-4"
          finderProfileUrl={pet.qrSafetyPath}
          qrStatus={pet.qrStatus}
          scroll
          tags={tags.data}
        />
      </section>

      <PetManagementTabs
        pet={pet}
        records={records.data}
        moments={moments.data}
        tags={tags.data}
      />
    </AppLayout>
  );
}
