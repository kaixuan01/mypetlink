"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { PetSwitcher } from "@/components/portal/PetSwitcher";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getActivePets } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import {
  getFriendlyMomentErrorMessage,
  getPetMoments,
} from "@/services/momentService";
import { getPets } from "@/services/petService";
import {
  getFriendlyRecordErrorMessage,
  getPetRecords,
} from "@/services/recordService";
import type { CareRecord, Pet, PetMoment } from "@/types";

type Section = "moments" | "records";

const copy: Record<
  Section,
  {
    eyebrow: string;
    landingTitle: string;
    title: (name: string) => string;
    description: string;
  }
> = {
  moments: {
    eyebrow: "Pet moments",
    landingTitle: "Choose a pet for Moments",
    title: (name) => `${name}'s memories`,
    description:
      "Save photos, short videos, milestones, funny moments, and life notes for this pet.",
  },
  records: {
    eyebrow: "Care Records",
    landingTitle: "Choose a pet for Care Records",
    title: (name) => `${name}'s health and care history`,
    description:
      "Keep vaccines, deworming, grooming, vet visits, medication, surgery, and lab tests in one place.",
  },
};

// Generic /moments and /records landing. A single pet can open immediately;
// owners with multiple pets choose explicitly so a general dashboard action
// never silently operates on whichever pet happened to load first.
export function GenericPetSection({ section }: { section: Section }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [moments, setMoments] = useState<PetMoment[]>([]);
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setError("");
      }
    });

    async function loadSection() {
      try {
        const response = await getPets();

        if (!active) {
          return;
        }

        const visiblePets = getActivePets(response.data);
        setPets(visiblePets);
        const onlyPet = visiblePets.length === 1 ? visiblePets[0] : undefined;

        if (onlyPet) {
          if (section === "moments") {
            const result = await getPetMoments(onlyPet.id);
            if (active) {
              setMoments(result.data);
            }
          } else {
            const result = await getPetRecords(onlyPet.id);
            if (active) {
              setRecords(result.data);
            }
          }
        }
      } catch (caught) {
        if (active) {
          setError(
            section === "moments"
              ? getFriendlyMomentErrorMessage(caught)
              : getFriendlyRecordErrorMessage(caught)
          );
          setPets([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSection();

    return () => {
      active = false;
    };
  }, [section]);

  if (loading) {
    return (
      <p className="text-sm font-semibold text-pet-muted">
        Loading your pets...
      </p>
    );
  }

  if (error) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Could not load pets
        </p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          This section is temporarily unavailable.
        </h2>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
          {error}
        </p>
      </section>
    );
  }

  const text = copy[section];

  if (!pets.length) {
    return (
      <EmptyState
        actionHref={ownerRoutes.petNew}
        actionLabel="Add a Pet"
        description="Add your first pet to start building their profile."
        icon="paw"
        title="No pets yet"
      />
    );
  }

  if (pets.length > 1) {
    const toHref =
      section === "moments"
        ? ownerRoutes.petMoments
        : ownerRoutes.petRecords;

    return (
      <>
        <PageHeader
          description="Choose the pet whose content you want to manage."
          eyebrow={text.eyebrow}
          title={text.landingTitle}
        />
        <nav
          aria-label={text.landingTitle}
          className="grid gap-3 sm:grid-cols-2"
        >
          {pets.map((item) => (
            <Link
              aria-label={`Open ${item.name}'s ${
                section === "moments" ? "moments" : "care records"
              }`}
              className="brand-card flex min-h-20 min-w-0 items-center gap-3 rounded-[1.5rem] p-4 transition hover:border-pet-teal hover:bg-pet-cream"
              href={toHref(item.id)}
              key={item.id}
            >
              <PetAvatar pet={item} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-black text-pet-ink">
                  {item.name}
                </span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-pet-muted">
                  {getPetSummaryLabel(item)}
                </span>
              </span>
              <span className="shrink-0 text-xs font-black text-pet-teal">
                Open
              </span>
            </Link>
          ))}
        </nav>
      </>
    );
  }

  const pet = pets[0];

  return (
    <>
      <PageHeader
        description={text.description}
        eyebrow={text.eyebrow}
        title={text.title(pet.name)}
      />
      <PetSwitcher activePetId={pet.id} pets={pets} section={section} />
      {section === "moments" ? (
        <PetMomentsManager initialMoments={moments} pet={pet} />
      ) : (
        <RecordsManager initialRecords={records} petId={pet.id} />
      )}
    </>
  );
}
