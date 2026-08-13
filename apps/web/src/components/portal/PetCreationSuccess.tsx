"use client";

import { useEffect, useRef } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { ownerRoutes } from "@/lib/routes";
import type { Pet } from "@/types";

type PetCreationSuccessProps = {
  canViewPublicProfile: boolean;
  pet: Pet;
};

export function PetCreationSuccess({
  canViewPublicProfile,
  pet,
}: PetCreationSuccessProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const petName = pet.name.trim() || "Your pet";

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="rounded-[1.75rem] border border-pet-mint bg-[#e8f8f0] p-6 shadow-sm sm:p-8">
      <p className="text-sm font-bold uppercase text-pet-sage">Profile ready</p>
      <h2
        className="mt-3 break-words text-3xl font-black text-pet-ink outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        {petName}&apos;s profile is ready!
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
        {canViewPublicProfile
          ? "See the page friends and family can view, then share it when it feels ready."
          : "Add a first Moment to begin building your pet's story."}
      </p>

      <div className="mt-6 grid max-w-md gap-3">
        {canViewPublicProfile ? (
          <>
            <CTAButton
              fullWidth
              href={pet.publicProfilePath}
              icon="heart"
              rel="noopener noreferrer"
              target="_blank"
            >
              View {petName}&apos;s Profile
            </CTAButton>
            <CTAButton
              fullWidth
              href={ownerRoutes.petMomentNew(pet.id)}
              icon="heart"
              variant="outline"
            >
              Add {petName}&apos;s First Moment
            </CTAButton>
          </>
        ) : (
          <>
            <CTAButton
              fullWidth
              href={ownerRoutes.petMomentNew(pet.id)}
              icon="heart"
            >
              Add {petName}&apos;s First Moment
            </CTAButton>
            <CTAButton
              fullWidth
              href={ownerRoutes.petProfile(pet.id)}
              icon="pets"
              variant="outline"
            >
              Manage {petName}
            </CTAButton>
          </>
        )}
      </div>
    </section>
  );
}
