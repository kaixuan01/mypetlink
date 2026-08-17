"use client";

import { useEffect, useState } from "react";
import { isOwnerAuthenticated } from "@/services/authService";
import { getOwnedPetByPublicCode } from "@/services/petService";
import type { Pet } from "@/types";

export type OwnedPublicProfileState = {
  /** The signed-in owner's pet for this public code, once ownership is verified. */
  pet: Pet | null;
  /**
   * Whether ownership has been decided. A logged-out visitor is resolved
   * immediately and never triggers a request, so the public page can render its
   * visitor-facing state without waiting or flashing.
   */
  resolved: boolean;
};

/**
 * Resolves whether the current visitor owns the pet behind a public profile.
 *
 * The public profile renders this answer in two places, so it is resolved once
 * here and passed down rather than requested per component.
 */
export function useOwnedPublicProfilePet(
  publicCode: string
): OwnedPublicProfileState {
  const [resolution, setResolution] = useState<{
    publicCode: string;
    pet: Pet | null;
  } | null>(null);

  useEffect(() => {
    let active = true;

    // A logged-out visitor is settled without a request. Both branches resolve
    // through the same promise so the answer always lands after the first
    // paint, and the page never flashes a state that ownership then contradicts.
    const lookup =
      publicCode && isOwnerAuthenticated()
        ? getOwnedPetByPublicCode(publicCode)
            .then((response) => response.data)
            .catch(() => null)
        : Promise.resolve(null);

    void lookup.then((pet) => {
      if (active) {
        setResolution({ publicCode, pet });
      }
    });

    return () => {
      active = false;
    };
  }, [publicCode]);

  const matches = resolution?.publicCode === publicCode;

  return {
    pet: matches ? resolution!.pet : null,
    resolved: matches,
  };
}
