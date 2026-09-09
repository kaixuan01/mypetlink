import {
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
} from "@/lib/features";
import { isActivePet } from "@/lib/petLifecycle";
import {
  addPublicProfileShareVersion,
  getAvailablePetShareCardOptions,
  getPublicProfileShareCardImagePath,
  getPublicProfileShareVersion,
  getPublicProfileSocialDescription,
  getPublicProfileSocialTitle,
  isPublicProfileShareable,
  type PetShareCardOption,
} from "@/lib/publicProfileSocial";
import { toAbsoluteUrl } from "@/lib/siteUrl";
import type { Pet, PetListItem, PublicPetProfile } from "@/types";

type PetShareAvatar = Pick<
  Pet,
  "photoInitial" | "photoTone" | "species"
> & { photoUrl?: string };

/**
 * Copies out the four fields the avatar draws with, rather than carrying the
 * whole pet along. A share target is handed to components that render for
 * visitors, so it holds only what sharing needs.
 */
function toShareAvatar(
  pet: Pick<Pet, "photoInitial" | "photoTone" | "species" | "photoUrl">
): PetShareAvatar {
  return {
    photoInitial: pet.photoInitial,
    photoTone: pet.photoTone,
    species: pet.species,
    photoUrl: pet.photoUrl,
  };
}

/**
 * Everything the Share Center needs to offer one pet's sharing choices.
 *
 * The same choices are offered to an owner in their portal and to a visitor
 * looking at a public profile, but only an owner may reach the finder-facing
 * Safety Profile. Describing the pet once, here, keeps that decision in a
 * single place instead of leaving each page to work out what a visitor is
 * allowed to see.
 */
export type PetShareTarget = {
  name: string;
  /** Used to name downloaded QR images. */
  slug: string;
  avatar: PetShareAvatar;
  publicProfilePath: string;
  /** False when there is nothing public to share yet. */
  publicProfileShareable: boolean;
  shareVersion: string;
  shareCardImagePath: string;
  shareCardOptions: PetShareCardOption[];
  /** The finder-facing Safety Profile, or null when it must not be offered. */
  safetyProfilePath: string | null;
};

/** Share choices for a pet the signed-in owner manages. */
export function toOwnerPetShareTarget(
  pet: Pet | PetListItem,
  now?: Date
): PetShareTarget {
  return {
    name: pet.name,
    slug: pet.slug,
    avatar: toShareAvatar(pet),
    publicProfilePath: pet.publicProfilePath,
    publicProfileShareable: publicProfilesEnabled && pet.publicProfileEnabled,
    shareVersion: getPublicProfileShareVersion(pet),
    shareCardImagePath: getPublicProfileShareCardImagePath(pet),
    shareCardOptions: getAvailablePetShareCardOptions(pet, now),
    safetyProfilePath:
      safetyProfilesOwnerUiEnabled && pet.qrSafetyEnabled && isActivePet(pet)
        ? pet.qrSafetyPath
        : null,
  };
}

/**
 * Share choices for anyone looking at a public profile, including a visitor
 * who is not signed in. Only the profile already on screen is shareable: the
 * Safety Profile is for someone who has found the pet, and stays out of the
 * ordinary sharing choices.
 */
export function toPublicProfileShareTarget(
  profile: PublicPetProfile,
  now?: Date
): PetShareTarget {
  return {
    name: profile.name,
    slug: profile.slug,
    avatar: toShareAvatar(profile),
    publicProfilePath: profile.publicProfilePath,
    publicProfileShareable: isPublicProfileShareable(profile),
    shareVersion: getPublicProfileShareVersion(profile),
    shareCardImagePath: getPublicProfileShareCardImagePath(profile),
    shareCardOptions: getAvailablePetShareCardOptions(profile, now),
    safetyProfilePath: null,
  };
}

/**
 * The one public profile address MyPetLink hands out. The share version rides
 * along so a freshly updated profile previews correctly the first time it is
 * pasted somewhere.
 */
export function getPetProfileShareUrl(
  target: Pick<PetShareTarget, "publicProfilePath" | "shareVersion">,
  origin?: string
) {
  return toAbsoluteUrl(
    addPublicProfileShareVersion(target.publicProfilePath, target.shareVersion),
    origin
  );
}

/**
 * What the device share sheet is given for a pet profile. It matches the
 * preview people already see when the same link is pasted into a chat.
 */
export function getPetProfileSharePayload(
  target: Pick<PetShareTarget, "name">,
  profileUrl: string
): ShareData {
  return {
    title: getPublicProfileSocialTitle(target.name),
    text: getPublicProfileSocialDescription(target.name),
    url: profileUrl,
  };
}
