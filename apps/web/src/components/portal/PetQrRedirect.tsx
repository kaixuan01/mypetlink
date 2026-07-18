"use client";

import { useEffect } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { ownerRoutes } from "@/lib/routes";

type PetQrRedirectProps = {
  petId: string;
};

export function PetQrRedirect({ petId }: PetQrRedirectProps) {
  const target = ownerRoutes.petProfile(petId);

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <section className="brand-card rounded-[1.75rem] p-6">
      <p className="text-xs font-extrabold uppercase text-pet-teal">
        Pet details
      </p>
      <h1 className="mt-2 text-2xl font-black text-pet-ink">
        Opening pet overview
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
        Public Share Profile, Safety Profile, and Physical Smart Tags are now
        managed from the pet overview.
      </p>
      <div className="mt-5">
        <CTAButton href={target}>Go to Pet Details</CTAButton>
      </div>
    </section>
  );
}
