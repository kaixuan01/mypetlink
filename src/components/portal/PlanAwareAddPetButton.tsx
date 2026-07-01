"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getPetLimitState } from "@/lib/planLimits";
import { ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";

type PlanAwareAddPetButtonProps = {
  className?: string;
  compact?: boolean;
  fullWidth?: boolean;
};

export function PlanAwareAddPetButton({
  className,
  compact = false,
  fullWidth,
}: PlanAwareAddPetButtonProps) {
  const router = useRouter();
  const [petCount, setPetCount] = useState<number | null>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);

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

  if (petCount === null) {
    return (
      <CTAButton
        className={`${compact ? "min-h-10 px-3 py-2 text-xs" : ""} ${className ?? ""}`.trim()}
        disabled
        fullWidth={fullWidth}
        icon="plus"
        variant="secondary"
      >
        {compact ? "..." : "Checking..."}
      </CTAButton>
    );
  }

  if (canCreate) {
    return (
      <CTAButton
        className={`${compact ? "min-h-10 px-3 py-2 text-xs" : ""} ${className ?? ""}`.trim()}
        fullWidth={fullWidth}
        href={ownerRoutes.petNew}
        icon="plus"
        variant="coral"
      >
        {compact ? "Add" : "Add Pet"}
      </CTAButton>
    );
  }

  return (
    <>
      <CTAButton
        className={`${compact ? "min-h-10 px-3 py-2 text-xs shadow-none" : ""} ${className ?? ""}`.trim()}
        fullWidth={fullWidth}
        icon="plus"
        onClick={() => setShowLimitDialog(true)}
        variant="secondary"
      >
        {compact ? "Limit" : "Limit Reached"}
      </CTAButton>
      <ConfirmDialog
        cancelLabel="Close"
        confirmLabel="View pricing"
        message={
          limit?.message ??
          "You've reached the Free profile limit. Premium plans for more pets are coming soon. Your existing pet profiles remain active."
        }
        onCancel={() => setShowLimitDialog(false)}
        onConfirm={() => {
          setShowLimitDialog(false);
          router.push("/pricing");
        }}
        open={showLimitDialog}
        title="Free profile limit reached"
      />
    </>
  );
}
