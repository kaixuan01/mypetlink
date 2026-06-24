"use client";

import { useEffect, useMemo, useState } from "react";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPetMoments } from "@/services/momentService";
import type { Pet, PetMoment } from "@/types";

type PetMomentsManagerProps = {
  pet: Pet;
  initialMoments: PetMoment[];
};

export function PetMomentsManager({
  pet,
  initialMoments,
}: PetMomentsManagerProps) {
  const [moments, setMoments] = useState(initialMoments);
  const counts = useMemo(
    () => ({
      public: moments.filter((moment) => moment.visibility === "Public").length,
      private: moments.filter((moment) => moment.visibility === "Private").length,
      family: moments.filter((moment) => moment.visibility === "Family Only")
        .length,
    }),
    [moments]
  );

  useEffect(() => {
    let active = true;

    getPetMoments(pet.id).then((response) => {
      if (active) {
        setMoments(response.data);
      }
    });

    return () => {
      active = false;
    };
  }, [pet.id]);

  return (
    <>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Recent moments</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {moments.length}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Public moments</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.public}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Private memories</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.private + counts.family}
          </p>
        </div>
      </section>

      <section className="brand-card mt-6 rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-pet-ink">
              Save the little moments
            </h2>
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              Save the little moments that make {pet.name} special.
            </p>
          </div>
          <CTAButton href={`/pets/${pet.id}/moments/new`} icon="plus" variant="coral">
            Add Moment
          </CTAButton>
        </div>
      </section>

      <section className="mt-6">
        {moments.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {moments.map((moment) => (
              <PetMomentCard key={moment.id} moment={moment} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="heart"
            title="No pet moments yet"
            description="Add your pet's first little moment and keep it safe in their profile."
            actionHref={`/pets/${pet.id}/moments/new`}
            actionLabel="Add Moment"
          />
        )}
      </section>
    </>
  );
}
