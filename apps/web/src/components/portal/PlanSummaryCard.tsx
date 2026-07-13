"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import {
  freePlanLimits,
  getCountedPetProfiles,
  getPetLimitStateFromPets,
  premiumPlan,
} from "@/lib/planLimits";
import { ownerRoutes } from "@/lib/routes";
import { getPetMoments } from "@/services/momentService";
import { getPets } from "@/services/petService";
import type { Pet, PetMoment } from "@/types";

type PlanSummaryCardProps = {
  initialPets?: Pet[];
  initialMoments?: PetMoment[];
  compact?: boolean;
  refreshOnMount?: boolean;
};

export function PlanSummaryCard({
  initialPets = [],
  initialMoments,
  compact = false,
  refreshOnMount = true,
}: PlanSummaryCardProps) {
  const [loadedPets, setLoadedPets] = useState<Pet[] | null>(null);
  const [loadedMemoryCounts, setLoadedMemoryCounts] = useState<Record<
    string,
    number
  > | null>(null);
  const providedMemoryCounts = useMemo(
    () => buildMemoryCounts(initialMoments ?? []),
    [initialMoments]
  );
  const pets = refreshOnMount ? (loadedPets ?? initialPets) : initialPets;
  const memoryCounts = refreshOnMount
    ? (loadedMemoryCounts ?? providedMemoryCounts)
    : providedMemoryCounts;

  useEffect(() => {
    if (!refreshOnMount) {
      return;
    }

    let active = true;

    getPets().then(async (petsResponse) => {
      const counts = await Promise.all(
        petsResponse.data.map(async (pet) => {
          const response = await getPetMoments(pet.id);
          return [pet.id, response.data.length] as const;
        })
      );

      if (!active) {
        return;
      }

      setLoadedPets(petsResponse.data);
      setLoadedMemoryCounts(Object.fromEntries(counts));
    });

    return () => {
      active = false;
    };
  }, [refreshOnMount]);

  const countedPets = getCountedPetProfiles(pets);
  const petLimit = getPetLimitStateFromPets(pets);
  const topMemoryRows = useMemo(
    () =>
      countedPets
        .slice(0, compact ? 2 : 4)
        .map((pet) => ({
          id: pet.id,
          name: pet.name,
          count: memoryCounts[pet.id] ?? 0,
        })),
    [compact, countedPets, memoryCounts]
  );

  return (
    <section className="brand-card rounded-[1.5rem] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="mint">Current plan: Free</Badge>
            <Badge tone="teal">Premium Coming Soon</Badge>
          </div>
          <h2 className="mt-3 text-lg font-black text-pet-ink">
            {petLimit.usageLabel}
          </h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            Smart tags are optional one-time add-ons. Basic safety features stay
            included with your free profile.
          </p>
          {petLimit.isOverLimit ? (
            <p className="mt-3 rounded-[1.25rem] bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
              {petLimit.message}
            </p>
          ) : null}
        </div>
        <CTAButton
          disabled={!petLimit.canCreate}
          href={petLimit.canCreate ? ownerRoutes.petNew : undefined}
          icon="plus"
          variant={petLimit.canCreate ? "coral" : "secondary"}
          className="shrink-0"
        >
          {petLimit.canCreate ? "Add Pet" : "Limit Reached"}
        </CTAButton>
      </div>

      {topMemoryRows.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {topMemoryRows.map((pet) => (
            <div className="rounded-[1rem] bg-pet-cream p-3" key={pet.id}>
              <p className="truncate text-sm font-black text-pet-ink">
                {pet.name}
              </p>
              <p className="mt-1 text-xs font-bold text-pet-muted">
                {pet.count} of {freePlanLimits.maxMemoriesPerPet} pet memories
                used
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-xs font-semibold leading-5 text-pet-muted">
        {premiumPlan.description}
      </p>
    </section>
  );
}

function buildMemoryCounts(moments: PetMoment[]) {
  return moments.reduce<Record<string, number>>((counts, moment) => {
    counts[moment.petId] = (counts[moment.petId] ?? 0) + 1;
    return counts;
  }, {});
}
