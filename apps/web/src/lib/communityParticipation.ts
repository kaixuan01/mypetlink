import type { PetSocialSettings } from "@/services/petSocialSettingsService";

/**
 * Whether one pet is in Community, and who can therefore find it.
 *
 * Four switches decide this and none of them implies another: the household
 * joined, this pet joined, this pet may be discovered, and the household may be
 * discovered. Explore and Search require the last two **together**
 * (`SocialDiscoveryService`), which is why a pet-level `isDiscoverable` on its
 * own is not enough to claim a pet is browsable — saying so when the household
 * is hidden would be a privacy claim that is simply untrue.
 *
 * Three labels, because three is the smallest number that tells the truth:
 * a pet is out, in but unlisted, or in and browsable.
 *
 * This is a read. The switches live on the Community profile editor and are not
 * duplicated anywhere; see docs/architecture/product-model.md.
 */
export type PetCommunityState =
  | "unavailable"
  | "not-participating"
  | "participating"
  | "discoverable";

export type PetCommunityStatus = {
  state: PetCommunityState;
  /** Short status, safe to render beside an icon. Never colour alone. */
  label: string;
  /** Who can actually reach the pet through Community in this state. */
  audience: string;
  tone: "mint" | "teal" | "soft";
  /**
   * Why the owner cannot put this pet into Community yet, in their words, or
   * empty when nothing is in the way. Derived from the server's own
   * `missingRequirements` keys so the screen and the API agree about the
   * blocker rather than guessing at it.
   */
  blockedReason: string;
};

export type PetCommunityInputs = {
  /** The household's own Community Profile switch. */
  ownerSocialEnabled: boolean;
  /** The household's "show me in search and browsing" switch. */
  ownerDiscoverable: boolean;
  /** This pet's row, or null when it could not be read. */
  pet: PetSocialSettings | null;
  petName: string;
};

function describeBlocker(missing: string[], petName: string) {
  // The Share Profile is the page somebody opens when they meet this pet in
  // Community, so Community needs one. The dependency runs this way only: a
  // Share Profile never requires Community.
  if (missing.includes("publicProfile")) {
    return `Turn on ${petName}'s Share Profile before adding them to Community.`;
  }

  if (missing.includes("lifecycle")) {
    return `Only an active pet can join Community.`;
  }

  return "";
}

export function derivePetCommunityStatus({
  ownerSocialEnabled,
  ownerDiscoverable,
  pet,
  petName,
}: PetCommunityInputs): PetCommunityStatus {
  if (!pet) {
    // Nothing was read, so nothing is claimed. The caller renders no row.
    return {
      state: "unavailable",
      label: "",
      audience: "",
      tone: "soft",
      blockedReason: "",
    };
  }

  const blockedReason = describeBlocker(pet.missingRequirements, petName);

  if (!ownerSocialEnabled || !pet.isSocialEnabled) {
    return {
      state: "not-participating",
      label: "Not in Community",
      audience: !ownerSocialEnabled
        ? "Your household has not joined Community, so no pet of yours appears there."
        : `${petName} does not appear in Community.`,
      tone: "soft",
      blockedReason,
    };
  }

  // Both halves, because Explore asks for both. A pet whose household is
  // hidden is not browsable however its own switch is set.
  if (pet.isDiscoverable && ownerDiscoverable) {
    return {
      state: "discoverable",
      label: "In Community · Discoverable",
      audience: "People browsing MyPetLink Community can find this pet.",
      tone: "mint",
      blockedReason,
    };
  }

  return {
    state: "participating",
    label: "In Community · Hidden from discovery",
    audience:
      "People who visit your Community Profile or follow you. Not shown to people browsing.",
    tone: "teal",
    blockedReason,
  };
}
