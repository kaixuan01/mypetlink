"use client";

import { useEffect, useState } from "react";
import {
  derivePetCommunityStatus,
  type PetCommunityStatus,
} from "@/lib/communityParticipation";
import { socialEnabled } from "@/lib/features";
import { getOwnerSocialProfile } from "@/services/ownerSocialService";
import { getPetSocialSettings } from "@/services/petSocialSettingsService";
import { isApiConfigured } from "@/services/apiConfig";

/**
 * This pet's place in Community, for the pet's own Sharing & Privacy summary.
 *
 * Two reads, because the answer needs both halves: the pet's row says whether
 * the pet joined and may be discovered, and the household's profile says
 * whether the household joined and may be discovered. Explore requires both
 * discoverability switches, so claiming "discoverable" from the pet's alone
 * would tell an owner their pet is browsable when it is not.
 *
 * Read-only. Nothing here writes, and the summary it feeds offers no switch —
 * the one authoritative control stays on the Community profile editor.
 *
 * Returns `state: "unavailable"` whenever the answer is not known: Community is
 * switched off for this build, there is no connection, or the request failed.
 * The caller renders nothing in that case rather than asserting "not in
 * Community", which would be a claim it cannot support.
 */
export function usePetCommunityStatus(petId: string, petName: string) {
  const [status, setStatus] = useState<PetCommunityStatus | null>(null);
  const [ownerHandle, setOwnerHandle] = useState("");

  useEffect(() => {
    if (!socialEnabled || !isApiConfigured() || !petId) {
      return undefined;
    }

    let active = true;

    void (async () => {
      try {
        const [petList, ownerProfile] = await Promise.all([
          getPetSocialSettings(),
          getOwnerSocialProfile(),
        ]);

        if (!active) {
          return;
        }

        const owner = ownerProfile.data;
        const pet =
          petList.data.pets.find((item) => item.petId === petId) ?? null;

        setOwnerHandle(owner.isSocialEnabled ? owner.handle.trim() : "");
        setStatus(
          derivePetCommunityStatus({
            ownerSocialEnabled: petList.data.ownerSocialEnabled,
            ownerDiscoverable: owner.isDiscoverable,
            pet,
            petName,
          })
        );
      } catch {
        // A Community read must never take the pet's own page down with it.
        // Saying nothing is the honest outcome of not knowing.
        if (active) {
          setStatus(null);
          setOwnerHandle("");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [petId, petName]);

  return {
    status: status && status.state !== "unavailable" ? status : null,
    /** The household's public page, when there is one to open. */
    ownerHandle,
  };
}
