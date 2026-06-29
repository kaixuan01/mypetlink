"use client";

import { useEffect, useState } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { getPetLimitState } from "@/lib/planLimits";
import { ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";

type PlanAwareAddPetButtonProps = {
  className?: string;
  fullWidth?: boolean;
};

export function PlanAwareAddPetButton({
  className,
  fullWidth,
}: PlanAwareAddPetButtonProps) {
  const [petCount, setPetCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    getPets().then((response) => {
      if (active) {
        setPetCount(response.data.length);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const limit = petCount === null ? null : getPetLimitState(petCount);
  const canCreate = limit?.canCreate ?? false;

  return (
    <CTAButton
      className={className}
      disabled={!canCreate}
      fullWidth={fullWidth}
      href={canCreate ? ownerRoutes.petNew : undefined}
      icon="plus"
      variant={canCreate ? "coral" : "secondary"}
    >
      {petCount === null
        ? "Checking..."
        : canCreate
          ? "Add Pet"
          : "Free Limit Reached"}
    </CTAButton>
  );
}
