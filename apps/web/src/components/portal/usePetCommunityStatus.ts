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
 * **A missing feature and missing data are not the same thing**, so they are
 * separate phases rather than one shared silence:
 *
 * - `hidden` — Community does not exist here at all: switched off for this
 *   build, or the owner is on the offline fallback. Nothing is rendered, which
 *   is what a soft launch or a rollback needs.
 * - `checking` / `unknown` — Community exists and this owner has it, but its
 *   state could not be read yet, or at all. The row still appears and says so.
 *   Dropping it would tell an owner their pet has no Community settings, which
 *   is a different and wrong claim.
 * - `known` — the answer, derived from both reads.
 *
 * `unknown` never carries a participation or discoverability word. Not knowing
 * is reported as not knowing.
 */
export type PetCommunityView =
  | { phase: "hidden" }
  | { phase: "checking" }
  | { phase: "unknown" }
  | { phase: "known"; status: PetCommunityStatus };

/** Everything the two reads can settle on, for one pet. */
type CommunityResult =
  | { phase: "checking" }
  | { phase: "unknown" }
  | { phase: "known"; status: PetCommunityStatus };

type CommunityRequest = {
  /** The pet these reads describe, so another pet's answer is never shown. */
  key: string;
  result: CommunityResult;
  ownerHandle: string;
};

const HIDDEN: PetCommunityView = { phase: "hidden" };

function checking(key: string): CommunityRequest {
  return { key, result: { phase: "checking" }, ownerHandle: "" };
}

export function usePetCommunityStatus(petId: string, petName: string) {
  // Whether Community exists here is known during render, so it is derived
  // rather than synchronised — an effect would paint the row and remove it.
  const available = socialEnabled && isApiConfigured() && Boolean(petId);
  const [request, setRequest] = useState<CommunityRequest>(() =>
    checking(petId)
  );

  // Switching pets discards the previous pet's answer immediately, so the
  // summary can never attribute one pet's Community state to another.
  if (request.key !== petId) {
    setRequest(checking(petId));
  }

  useEffect(() => {
    if (!available) {
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
        const status = derivePetCommunityStatus({
          ownerSocialEnabled: petList.data.ownerSocialEnabled,
          ownerDiscoverable: owner.isDiscoverable,
          pet,
          petName,
        });

        setRequest({
          key: petId,
          // The reads came back, but without this pet there is no
          // participation to report: a loaded response is not a known answer.
          result:
            status.state === "unavailable"
              ? { phase: "unknown" }
              : { phase: "known", status },
          ownerHandle: owner.isSocialEnabled ? owner.handle.trim() : "",
        });
      } catch {
        // A Community read must never take the pet's own page down with it,
        // and must never be answered with a guess. An auth failure is handled
        // where every other one is; there is no separate recovery here.
        if (active) {
          setRequest({ key: petId, result: { phase: "unknown" }, ownerHandle: "" });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [available, petId, petName]);

  const settled = request.key === petId ? request : checking(petId);

  return {
    view: available ? (settled.result as PetCommunityView) : HIDDEN,
    /** The household's public page, when there is one to open. */
    ownerHandle: available ? settled.ownerHandle : "",
  };
}
