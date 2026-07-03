"use client";

import { useEffect, useState } from "react";
import { PetProfileForm } from "@/components/portal/PetProfileForm";
import { CTAButton } from "@/components/ui/CTAButton";
import { getPetLimitStateFromPets } from "@/lib/planLimits";
import { ownerRoutes } from "@/lib/routes";
import {
  getFriendlyApiErrorMessage,
  getPets,
} from "@/services/petService";
import type { Pet } from "@/types";

export function NewPetForm() {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getPets()
      .then((response) => {
        if (active) {
          setPets(response.data);
          setError("");
        }
      })
      .catch((caught) => {
        if (active) {
          setError(getFriendlyApiErrorMessage(caught));
          setPets([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (pets === null) {
    return (
      <div className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-semibold text-pet-muted">
          Checking your Free profile allowance...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Could not check your allowance
        </p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          Please try again in a moment.
        </h2>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
          {error}
        </p>
        <CTAButton className="mt-5" href={ownerRoutes.pets} variant="secondary">
          Back to My Pets
        </CTAButton>
      </section>
    );
  }

  const limit = getPetLimitStateFromPets(pets);

  if (!limit.canCreate) {
    return (
      <section className="brand-soft-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Free profile limit
        </p>
        <h2 className="mt-3 text-2xl font-black text-pet-ink">
          Premium plans for more pets are coming soon.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          {limit.message}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <CTAButton href={ownerRoutes.pets} icon="pets">
            View Existing Pets
          </CTAButton>
          <CTAButton href={ownerRoutes.dashboard} variant="secondary">
            Owner Dashboard
          </CTAButton>
        </div>
      </section>
    );
  }

  return <PetProfileForm mode="create" />;
}
