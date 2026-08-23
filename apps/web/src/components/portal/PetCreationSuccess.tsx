"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { ownerRoutes } from "@/lib/routes";
import type { Pet } from "@/types";

type PetCreationSuccessProps = {
  canViewPublicProfile: boolean;
  pet: Pet;
  warning?: string;
};

export function PetCreationSuccess({
  canViewPublicProfile,
  pet,
  warning,
}: PetCreationSuccessProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const petName = pet.name.trim() || "Your pet";

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="rounded-[1.75rem] border border-pet-mint bg-[#e8f8f0] p-6 shadow-sm sm:p-8">
      <div className="flex flex-col items-center text-center">
        <PetAvatar pet={pet} size="lg" />
        <p className="mt-4 text-sm font-bold uppercase text-pet-sage">
          Pet added
        </p>
        <h2
          className="mt-2 break-words text-3xl font-black text-pet-ink outline-none"
          ref={headingRef}
          tabIndex={-1}
        >
          {petName} is on MyPetLink
        </h2>
      </div>

      {warning ? (
        <div
          className="mx-auto mt-5 max-w-md rounded-[1.25rem] border border-[#efb44c] bg-[#fff8e7] px-4 py-3 text-left text-sm font-semibold leading-6 text-pet-ink"
          role="status"
        >
          {warning}
        </div>
      ) : null}

      <div className="mx-auto mt-6 grid max-w-md justify-items-center gap-3">
        <CTAButton
          fullWidth
          href={ownerRoutes.petProfile(pet.id)}
          icon="pets"
        >
          Go to {petName}&apos;s page
        </CTAButton>
        {canViewPublicProfile ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-extrabold text-pet-teal underline decoration-2 underline-offset-4 hover:text-[#0f5fd0]"
            href={pet.publicProfilePath}
            rel="noopener noreferrer"
            target="_blank"
          >
            View public profile
          </Link>
        ) : null}
      </div>
    </section>
  );
}
