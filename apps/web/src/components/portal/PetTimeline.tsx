"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MomentMediaCarousel } from "@/components/moments/MomentMediaCarousel";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  buildPetTimeline,
  isItemPubliclyShown,
  type PetTimelineItem,
} from "@/lib/petTimeline";
import { ownerRoutes } from "@/lib/routes";
import {
  getFriendlyMomentErrorMessage,
  getPetMoments,
} from "@/services/momentService";
import { getPetById } from "@/services/petService";
import type { Pet, PetMoment } from "@/types";

type PetTimelineProps = {
  pet: Pet;
  initialMoments: PetMoment[];
};

const visibilityTone = {
  Public: "mint",
  Private: "soft",
  "Family Only": "warm",
} as const;

export function PetTimeline({ pet: initialPet, initialMoments }: PetTimelineProps) {
  const [pet, setPet] = useState(initialPet);
  const [moments, setMoments] = useState(initialMoments);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const items = buildPetTimeline(pet, moments);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setLoadError("");
      }
    });

    // Re-read pet (for live visibility settings) and moments on the client so
    // the timeline reflects edits saved in this browser.
    Promise.all([getPetById(initialPet.id), getPetMoments(initialPet.id)])
      .then(([petResponse, momentResponse]) => {
        if (active && petResponse.data) {
          setPet(petResponse.data);
        }

        if (active) {
          setMoments(momentResponse.data);
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError(getFriendlyMomentErrorMessage(caught));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [initialPet.id]);

  const actions = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <CTAButton href={ownerRoutes.petMomentNew(pet.id)} icon="plus">
        Add Moment
      </CTAButton>
      <CTAButton
        href={ownerRoutes.petMoments(pet.id)}
        variant="secondary"
        icon="heart"
      >
        Manage Moments
      </CTAButton>
      <CTAButton
        href={ownerRoutes.petEdit(pet.id)}
        variant="outline"
        icon="settings"
      >
        Edit Pet Details
      </CTAButton>
      <CTAButton
        href={pet.publicProfilePath}
        variant="outline"
        icon="qr"
        target="_blank"
        rel="noopener noreferrer"
      >
        View Public Profile
      </CTAButton>
    </div>
  );

  return (
    <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-black text-pet-ink">
            {pet.name}&apos;s life timeline
          </h2>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            Timeline items come from birthday/adoption details and moments marked
            as Show in Life Timeline.
          </p>
        </div>
        {actions}
      </div>

      {!pet.visibility.showTimeline ? (
        <p className="mt-5 rounded-[1.25rem] bg-pet-apricot/60 p-4 text-sm font-semibold leading-6 text-[#9b4037]">
          Life Timeline is currently hidden on {pet.name}&apos;s public profile.
          Turn on Show Life Timeline in Edit Pet Details to share these
          milestones.
        </p>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-[1.25rem] bg-pet-cream p-4">
          <p className="text-sm font-semibold text-pet-muted">
            Loading timeline...
          </p>
        </div>
      ) : loadError ? (
        <div className="mt-6 rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4">
          <p className="text-sm font-bold text-[#a63c2e]">{loadError}</p>
        </div>
      ) : items.length ? (
        <div className="mt-6 grid gap-4">
          {items.map((item) => (
            <TimelineRow item={item} key={item.id} pet={pet} />
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon="heart"
            title="No timeline items yet"
            description="Add a birthday or adoption day in Edit Pet Details, or add a moment and choose Show in Life Timeline."
            actionHref={ownerRoutes.petMomentNew(pet.id)}
            actionLabel="Add Moment"
          />
        </div>
      )}
    </section>
  );
}

function TimelineRow({ item, pet }: { item: PetTimelineItem; pet: Pet }) {
  const publiclyShown = isItemPubliclyShown(item, pet);
  const editHref =
    item.source === "moment"
      ? ownerRoutes.petMoments(pet.id)
      : ownerRoutes.petEdit(pet.id);

  return (
    <article className="overflow-hidden rounded-[1.25rem] bg-pet-cream">
      {item.moment?.media.length ? (
        <MomentMediaCarousel compact moment={item.moment} />
      ) : null}
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {item.source === "auto" ? (
              <Badge tone="teal">Auto milestone</Badge>
            ) : (
              <Badge tone="soft">{item.typeLabel}</Badge>
            )}
            {item.visibility ? (
              <Badge tone={visibilityTone[item.visibility]}>
                {item.visibility}
              </Badge>
            ) : null}
            <Badge tone={publiclyShown ? "mint" : "soft"}>
              {publiclyShown ? "Shown on public profile" : "Hidden from public"}
            </Badge>
          </div>
          <p className="mt-2 text-xs font-bold uppercase text-pet-muted">
            {item.date}
          </p>
          <h3 className="mt-1 text-lg font-black text-pet-ink">{item.title}</h3>
          {item.description ? (
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              {item.description}
            </p>
          ) : null}
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-white/70 sm:self-center"
          href={editHref}
        >
          {item.source === "moment" ? "Edit in Moments" : "Edit pet details"}
        </Link>
      </div>
    </article>
  );
}
