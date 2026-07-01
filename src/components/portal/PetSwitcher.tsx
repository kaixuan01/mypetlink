"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";
import type { Pet } from "@/types";

type PetSwitcherSection = "moments" | "records";

type PetSwitcherProps = {
  pets: Pet[];
  activePetId: string;
  section: PetSwitcherSection;
};

const sectionHref: Record<PetSwitcherSection, (petId: string) => string> = {
  moments: ownerRoutes.petMoments,
  records: ownerRoutes.petRecords,
};

// Lets the owner move between their pets without leaving the section. Switching
// navigates to that pet's own route (/pets/{petId}/moments|records), so the
// page title, stats, and cards always belong to the selected pet.
export function PetSwitcher({
  pets: initialPets,
  activePetId,
  section,
}: PetSwitcherProps) {
  const [pets, setPets] = useState(
    initialPets.filter((pet) => pet.lifecycleStatus !== "Archived")
  );

  useEffect(() => {
    let active = true;

    getPets().then((response) => {
      if (active) {
        setPets(
          response.data.filter((pet) => pet.lifecycleStatus !== "Archived")
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (pets.length <= 1) {
    return null;
  }

  const toHref = sectionHref[section];

  return (
    <nav
      aria-label="Choose a pet"
      className="mb-6 flex gap-2 overflow-x-auto pb-1"
    >
      {pets.map((pet) => {
        const active = pet.id === activePetId;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
              active
                ? "border-pet-teal bg-[#e8f3ff] text-pet-ink"
                : "border-pet-border bg-white text-pet-muted hover:bg-pet-cream"
            }`}
            href={toHref(pet.id)}
            key={pet.id}
          >
            {pet.name}
          </Link>
        );
      })}
    </nav>
  );
}
