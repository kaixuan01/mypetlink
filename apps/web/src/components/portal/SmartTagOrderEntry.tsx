"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TagOrderFlow } from "@/components/portal/TagOrderFlow";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { ownerRoutes } from "@/lib/routes";
import {
  getEligibleSmartTagOrderPets,
  getPreferredSmartTagOrderPetId,
} from "@/lib/smartTagOrder";
import {
  getFriendlyApiErrorMessage,
  getPets,
} from "@/services/petService";
import type { Pet } from "@/types";

type LoadState = "loading" | "ready" | "error";

export function SmartTagOrderEntry() {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const eligiblePets = useMemo(
    () => getEligibleSmartTagOrderPets(pets),
    [pets]
  );

  useEffect(() => {
    let active = true;

    getPets()
      .then((response) => {
        if (!active) return;

        const nextEligiblePets = getEligibleSmartTagOrderPets(response.data);
        const preferredPetId = getPreferredSmartTagOrderPetId(
          window.location.href
        );
        const preferredPet = nextEligiblePets.find(
          (pet) => pet.id === preferredPetId
        );

        setPets(response.data);
        setSelectedPetId(
          preferredPet?.id ??
            (nextEligiblePets.length === 1 ? nextEligiblePets[0].id : "")
        );
        setLoadState("ready");
      })
      .catch((caught) => {
        if (!active) return;

        setLoadError(getFriendlyApiErrorMessage(caught));
        setLoadState("error");
      });

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (loadState === "ready" && eligiblePets.length === 0) {
      router.replace(ownerRoutes.petNewForTagOrder());
    }
  }, [eligiblePets.length, loadState, router]);

  if (loadState === "loading") {
    return (
      <div
        className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted"
        role="status"
      >
        Loading your pet profiles...
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <EmptyState
        icon="tag"
        title="Pet profiles could not load"
        description={`${loadError} Your Smart Tag order has not started yet.`}
        actionLabel="Try Again"
        actionOnClick={() => {
          setLoadState("loading");
          setLoadError("");
          setLoadAttempt((current) => current + 1);
        }}
      />
    );
  }

  if (!eligiblePets.length) {
    return (
      <div
        className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted"
        role="status"
      >
        Taking you to Add Pet so you can create the profile needed for this
        Smart Tag...
      </div>
    );
  }

  const selectedPet = eligiblePets.find((pet) => pet.id === selectedPetId);

  if (!selectedPet && eligiblePets.length > 1) {
    return (
      <section className="brand-card min-w-0 rounded-[1.75rem] p-5 sm:p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">Choose a pet</p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          Who is this physical tag for?
        </h2>
        <p className="mt-2 text-sm leading-6 text-pet-muted">
          Select an active pet profile to continue to tag options.
        </p>
        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
          {eligiblePets.map((pet) => (
            <button
              className="min-w-0 rounded-2xl border border-pet-border bg-pet-cream p-4 text-left transition hover:border-pet-teal hover:bg-[#e8f3ff]"
              key={pet.id}
              onClick={() => setSelectedPetId(pet.id)}
              type="button"
            >
              <span className="block break-words text-lg font-black text-pet-ink">
                {pet.name}
              </span>
              <span className="mt-1 block break-words text-sm text-pet-muted">
                {getPetSummaryLabel(pet)}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <TagOrderFlow
      key={selectedPetId}
      initialTagType="MyPetLink QR Pet Tag"
      pets={eligiblePets}
      preselectedPetId={selectedPetId}
    />
  );
}
