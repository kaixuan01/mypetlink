"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  getCountedPetProfiles,
  getEffectivePlanLimits,
  getPetLimitStateFromPets,
} from "@/lib/planLimits";
import { getPetMoments } from "@/services/momentService";
import {
  getOwnerPlanSummary,
  type OwnerPlanSummary,
} from "@/services/ownerProfileService";
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
  const [planSummary, setPlanSummary] = useState<OwnerPlanSummary | null>(null);
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

    getOwnerPlanSummary()
      .then((summary) => {
        if (active) {
          setPlanSummary(summary);
        }
      })
      .catch(() => {
        // The baseline limits still apply; the card stays usable.
      });

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
  const planName = planSummary?.planName ?? getEffectivePlanLimits().planName;
  const maxMemoriesPerPet =
    planSummary?.maxMemoriesPerPet ?? getEffectivePlanLimits().maxMemoriesPerPet;
  const memoryRows = useMemo(
    () =>
      countedPets
        .map((pet) => ({
          id: pet.id,
          name: pet.name,
          count: memoryCounts[pet.id] ?? 0,
        })),
    [countedPets, memoryCounts]
  );

  return (
    <section
      className={`brand-card rounded-[1.5rem] ${compact ? "p-5" : "p-5 sm:p-6"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-pet-ink">Current plan: {planName}</p>
        <Badge tone="teal">Premium coming soon</Badge>
      </div>

      <div className="mt-4 grid gap-3">
        <UsageRow
          label="Pet profiles"
          used={petLimit.count}
          max={petLimit.max}
        />
        {memoryRows.map((pet) => (
          <UsageRow
            key={pet.id}
            label={`${pet.name} memories`}
            used={pet.count}
            max={maxMemoriesPerPet}
          />
        ))}
      </div>

      {petLimit.isOverLimit ? (
        <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-xs font-semibold leading-5 text-pet-muted">
          {petLimit.message}
        </p>
      ) : null}
    </section>
  );
}

function UsageRow({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const atLimit = used >= max;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-bold text-pet-ink">
          {label}
        </span>
        <span
          className={`shrink-0 text-sm font-black ${
            atLimit ? "text-pet-coral" : "text-pet-muted"
          }`}
        >
          {used} / {max}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-pet-cream"
      >
        <div
          className={`h-full rounded-full ${
            atLimit ? "bg-pet-coral" : "bg-pet-teal"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function buildMemoryCounts(moments: PetMoment[]) {
  return moments.reduce<Record<string, number>>((counts, moment) => {
    counts[moment.petId] = (counts[moment.petId] ?? 0) + 1;
    return counts;
  }, {});
}
