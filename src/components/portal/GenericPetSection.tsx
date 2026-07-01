"use client";

import { useEffect, useState } from "react";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { PetSwitcher } from "@/components/portal/PetSwitcher";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getActivePets } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import { getPetMoments } from "@/services/momentService";
import { getPets } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import type { CareRecord, Pet, PetMoment } from "@/types";

type Section = "moments" | "records";

const copy: Record<
  Section,
  { eyebrow: string; title: (name: string) => string; description: string }
> = {
  moments: {
    eyebrow: "Pet moments",
    title: (name) => `${name}'s memories`,
    description:
      "Save photos, short videos, milestones, funny moments, and life notes for this pet.",
  },
  records: {
    eyebrow: "Care Records",
    title: (name) => `${name}'s health and care history`,
    description:
      "Keep vaccines, deworming, grooming, vet visits, medication, and allergy notes in one place.",
  },
};

// Generic /moments and /records landing. Selects the owner's first pet and
// renders the same pet-aware view as the per-pet routes, with the switcher on
// top so they can jump to any other pet.
export function GenericPetSection({ section }: { section: Section }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [moments, setMoments] = useState<PetMoment[]>([]);
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getPets().then(async (response) => {
      if (!active) {
        return;
      }

      const visiblePets = getActivePets(response.data);
      setPets(visiblePets);
      const firstPet = visiblePets[0];

      if (firstPet) {
        if (section === "moments") {
          const result = await getPetMoments(firstPet.id);
          if (active) {
            setMoments(result.data);
          }
        } else {
          const result = await getPetRecords(firstPet.id);
          if (active) {
            setRecords(result.data);
          }
        }
      }

      if (active) {
        setLoading(false);
      }
    });

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

  const pet = pets[0];

  if (!pet) {
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

  const text = copy[section];

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
