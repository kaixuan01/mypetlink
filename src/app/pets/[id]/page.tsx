import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import {
  getQrStatusLabel,
  ProfileAccessBadges,
} from "@/components/portal/ProfileAccessStatus";
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
      <section className="brand-card mb-6 rounded-[2rem] p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-5">
            <PetAvatar pet={pet} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-black text-pet-ink">{pet.name}</h1>
                <ProfileAccessBadges qrStatus={pet.qrStatus} />
              </div>
              <p className="mt-2 text-sm text-pet-muted">
                {pet.species} - {pet.breed} - {pet.ageLabel}
              </p>
              <p className="mt-1 text-sm font-bold text-pet-muted">
                {getQrStatusLabel(pet.qrStatus)}
              </p>
            </div>
          </div>
          <CTAButton href={ownerRoutes.petEdit(pet.id)} icon="settings">
            Edit Pet Details
          </CTAButton>
        </div>
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
