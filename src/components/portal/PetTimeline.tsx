"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPetMoments } from "@/services/momentService";
import type { Pet, PetMoment } from "@/types";

type PetTimelineProps = {
  pet: Pet;
  initialMoments: PetMoment[];
};

export function PetTimeline({ pet, initialMoments }: PetTimelineProps) {
  const [moments, setMoments] = useState(initialMoments);
  const timelineMoments = moments.filter((moment) => moment.showInLifeTimeline);

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

  if (!timelineMoments.length) {
    return (
      <EmptyState
        icon="heart"
        title="No timeline yet"
        description="Add pet moments and choose which milestones should appear in this life timeline."
        actionHref={`/pets/${pet.id}/moments/new`}
        actionLabel="Add Moment"
      />
    );
  }

  return (
    <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-pet-ink">
            {pet.name}&apos;s life timeline
          </h2>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            Moments appear here when you select Show in Life Timeline from the
            moments manager.
          </p>
        </div>
        <CTAButton href={`/pets/${pet.id}/moments/new`} icon="plus">
          Add Moment
        </CTAButton>
      </div>

      <div className="mt-8 grid gap-4">
        {timelineMoments.map((moment, index) => (
          <article
            className="grid gap-4 rounded-[1.25rem] bg-pet-cream p-4 sm:grid-cols-[72px_1fr]"
            key={moment.id}
          >
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-xl font-black text-pet-coral">
              {index + 1}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={moment.visibility === "Public" ? "mint" : "soft"}>
                  {moment.type}
                </Badge>
                <span className="text-sm font-bold text-pet-muted">
                  {moment.date}
                </span>
              </div>
              <h3 className="mt-2 text-xl font-black text-pet-ink">
                {moment.title}
              </h3>
              {moment.caption ? (
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  {moment.caption}
                </p>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
