import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetLifecycleActions } from "@/components/portal/PetLifecycleActions";
import { ProfileAccessBadges } from "@/components/portal/ProfileAccessStatus";
import { PetManagementTabs } from "@/components/portal/PetManagementTabs";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { loadingTitle, ownerPetPageTitle } from "@/lib/pageTitles";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { ownerRoutes } from "@/lib/routes";
import { getPetMoments } from "@/services/momentService";
import { getPetById } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getOrders, getPetTags } from "@/services/tagService";

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
    title: pet.data ? ownerPetPageTitle("profile", pet.data.name) : loadingTitle,
  };
}

export default async function PetDetailPage({ params }: PetDetailPageProps) {
  const { id } = await params;
  const petResponse = await getPetById(id);

  if (!petResponse.data) {
    notFound();
  }

  const pet = petResponse.data;
  const isMemorial = pet.lifecycleStatus === "Memorial";
  const isArchived = pet.lifecycleStatus === "Archived";
  const records = await getPetRecords(pet.id);
  const tags = await getPetTags(pet.id);
  const moments = await getPetMoments(pet.id);
  const orders = await getOrders();
  const petOrders = orders.data.filter((order) => order.petId === pet.id);

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
                {isMemorial ? `Remembering ${pet.name}` : pet.name}
              </h1>
              <p className="mt-1 text-sm text-pet-muted">
                {getPetSummaryLabel(pet)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {isMemorial ? <Badge tone="soft">Memorial</Badge> : null}
                {isArchived ? <Badge tone="soft">Archived</Badge> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <CTAButton
              href={ownerRoutes.petEdit(pet.id)}
              icon="settings"
              fullWidth
              className="sm:w-auto"
            >
              {isMemorial ? "Edit Memorial" : "Edit Pet Details"}
            </CTAButton>
            {isArchived ? (
              <CTAButton
                href={pet.publicProfilePath}
                icon="heart"
                variant="outline"
                target="_blank"
                rel="noopener noreferrer"
                fullWidth
                className="sm:w-auto"
              >
                View Profile
              </CTAButton>
            ) : null}
          </div>
        </div>
        {isMemorial ? (
          <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
            <p className="text-sm font-black text-pet-ink">
              {pet.name} is lovingly remembered.
            </p>
            {pet.memorial.passedAwayDate ? (
              <p className="mt-1 text-sm text-pet-muted">
                Passed away: {pet.memorial.passedAwayDate}
              </p>
            ) : null}
            {pet.memorial.memorialMessage ? (
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                {pet.memorial.memorialMessage}
              </p>
            ) : null}
          </div>
        ) : isArchived ? (
          <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
            <p className="text-sm font-black text-pet-ink">
              This pet profile is archived.
            </p>
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              Archived profiles are hidden from your main list but their
              memories and records stay safe.
            </p>
          </div>
        ) : (
          <ProfileAccessBadges
            className="mt-4"
            finderProfileUrl={pet.qrSafetyPath}
            orders={petOrders}
            qrStatus={pet.qrStatus}
            scroll
            tags={tags.data}
          />
        )}
        <div className="mt-4">
          <PetLifecycleActions pet={pet} />
        </div>
      </section>

      <PetManagementTabs
        pet={pet}
        records={records.data}
        moments={moments.data}
        orders={petOrders}
        tags={tags.data}
      />
    </AppLayout>
  );
}
