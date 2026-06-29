"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { freePlanLimits, getPetLimitState, premiumPlan } from "@/lib/planLimits";
import { ownerRoutes } from "@/lib/routes";
import { getPetMoments } from "@/services/momentService";
import { getPets } from "@/services/petService";
import type { Pet } from "@/types";

type PlanSummaryCardProps = {
  initialPets?: Pet[];
  compact?: boolean;
};

export function PlanSummaryCard({
  initialPets = [],
  compact = false,
}: PlanSummaryCardProps) {
  const [pets, setPets] = useState(initialPets);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
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

      setPets(petsResponse.data);
      setMemoryCounts(Object.fromEntries(counts));
    });

    return () => {
      active = false;
    };
  }, []);

  const petLimit = getPetLimitState(pets.length);
  const topMemoryRows = useMemo(
    () =>
      pets
        .slice(0, compact ? 2 : 4)
        .map((pet) => ({
          id: pet.id,
          name: pet.name,
          count: memoryCounts[pet.id] ?? 0,
        })),
    [compact, memoryCounts, pets]
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
