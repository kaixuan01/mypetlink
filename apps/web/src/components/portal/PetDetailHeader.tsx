"use client";

import { useEffect, useState } from "react";
import { PetLifecycleActions } from "@/components/portal/PetLifecycleActions";
import { ProfileAccessBadges } from "@/components/portal/ProfileAccessStatus";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { publicProfilesEnabled } from "@/lib/features";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import { getPetById } from "@/services/petService";
import type { Pet, PetTag, TagOrder } from "@/types";

type PetDetailHeaderProps = {
  pet: Pet;
  petOrders: TagOrder[];
  tags: PetTag[];
};

export function PetDetailHeader({
  pet,
  petOrders,
  tags,
}: PetDetailHeaderProps) {
  const [currentPet, setCurrentPet] = useState(pet);

  useEffect(() => {
    let active = true;

    getPetById(pet.id).then((response) => {
      if (active && response.data) {
        setCurrentPet(response.data);
      }
    });

    return () => {
      active = false;
    };
  }, [pet.id]);

  const isMemorial = isMemorialPet(currentPet);
  const isArchived = isArchivedPet(currentPet);
  const canViewMemorialProfile =
    publicProfilesEnabled &&
    isMemorial &&
    currentPet.publicProfileEnabled &&
    currentPet.memorial.showMemorialOnPublicProfile;

  return (
    <section className="brand-card mb-6 rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="sm:hidden">
            <PetAvatar pet={currentPet} size="md" />
          </span>
          <span className="hidden sm:block">
            <PetAvatar pet={currentPet} size="lg" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black text-pet-ink sm:text-3xl">
              {isMemorial ? `Remembering ${currentPet.name}` : currentPet.name}
            </h1>
            <p className="mt-1 text-sm text-pet-muted">
              {getPetSummaryLabel(currentPet)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {isMemorial ? <Badge tone="soft">Memorial</Badge> : null}
              {isArchived ? <Badge tone="soft">Archived</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <CTAButton
            href={ownerRoutes.petEdit(currentPet.id)}
            icon="settings"
            fullWidth
            className="sm:w-auto"
          >
            {isMemorial ? "Edit Memorial" : "Edit Pet Details"}
          </CTAButton>
          {canViewMemorialProfile ? (
            <CTAButton
              href={currentPet.publicProfilePath}
              icon="heart"
              variant="outline"
              target="_blank"
              rel="noopener noreferrer"
              fullWidth
              className="sm:w-auto"
            >
              View Memorial Profile
            </CTAButton>
          ) : null}
        </div>
      </div>
      {isMemorial ? (
        <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
          <p className="text-sm font-black text-pet-ink">
            In memory of {currentPet.name}
          </p>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            This pet is marked as memorial. The profile and memories are kept
            for remembrance.
          </p>
          {currentPet.memorial.passedAwayDate ? (
            <p className="mt-1 text-sm text-pet-muted">
              Passed away: {currentPet.memorial.passedAwayDate}
            </p>
          ) : null}
          {currentPet.memorial.memorialMessage ? (
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              {currentPet.memorial.memorialMessage}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <CTAButton
              href={ownerRoutes.petMoments(currentPet.id)}
              icon="heart"
              variant="secondary"
              fullWidth
            >
              Manage Memories
            </CTAButton>
            <CTAButton
              href={ownerRoutes.petTimeline(currentPet.id)}
              icon="record"
              variant="outline"
              fullWidth
            >
              View Timeline
            </CTAButton>
          </div>
        </div>
      ) : isArchived ? (
        <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
          <p className="text-sm font-black text-pet-ink">
            This pet profile is archived.
          </p>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            Archived profiles are hidden from your main list but their memories
            and records stay safe.
          </p>
        </div>
      ) : (
        <ProfileAccessBadges
          className="mt-4"
          orders={petOrders}
          pet={currentPet}
          scroll
          tags={tags}
        />
      )}
      <div className="mt-4">
        <PetLifecycleActions pet={currentPet} />
      </div>
    </section>
  );
}
