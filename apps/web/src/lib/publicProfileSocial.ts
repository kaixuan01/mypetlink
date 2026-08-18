import { getPetTypeLabel } from "@/lib/petDisplay";
import type { PublicPetProfile } from "@/types";
import type { PetShareCardVariant } from "@/lib/petOccasions";
import { derivePetOccasions } from "@/lib/petOccasions";

export const publicProfileSocialImageSize = {
  width: 1200,
  height: 630,
} as const;

export const publicProfileShareCardImageSize = {
  width: 1080,
  height: 1350,
} as const;

export const publicProfileSocialImageContentType = "image/jpeg";

export function getPublicProfileSocialTitle(petName: string) {
  const name = cleanSocialText(petName, 80) || "Pet";
  return `Meet ${name} | MyPetLink`;
}

export function getPublicProfileSocialDescription(petName: string) {
  const name = cleanSocialText(petName, 80) || "Pet";
  return `View ${name}'s public profile, memories, and important safety information.`;
}

/**
 * Caption an owner sends alongside a Share Card. The card is a warm, social
 * thing, so it gets warm, social wording rather than the descriptive line used
 * for crawler metadata. The caller appends the profile URL.
 */
export function getPetShareCardMessage(petName: string) {
  const name = cleanSocialText(petName, 80) || "Pet";
  return `Meet ${name} on MyPetLink 🐾`;
}

export type PublicProfileSocialCardData = {
  ageLabel?: string;
  coverUrl?: string;
  initial: string;
  lostModeEnabled: boolean;
  name: string;
  photoUrl?: string;
  summary: string;
};

type SocialProfileFields = Pick<
  PublicPetProfile,
  | "ageLabel"
  | "breed"
  | "coverUrl"
  | "customSpecies"
  | "lifecycleStatus"
  | "lostModeEnabled"
  | "name"
  | "photoInitial"
  | "photoUrl"
  | "publicProfilePath"
  | "publicProfileVersion"
  | "species"
  | "visibility"
>;

type OccasionSocialProfileFields = SocialProfileFields &
  Pick<PublicPetProfile, "birthday" | "adoptionDay">;

const unavailableValues = new Set([
  "",
  "age unknown",
  "not set",
  "not specified",
  "unknown",
]);

export function isPublicProfileShareable(
  profile?: Pick<SocialProfileFields, "lifecycleStatus"> | null
) {
  return Boolean(profile && profile.lifecycleStatus !== "Archived");
}

export function toPublicProfileSocialCardData(
  profile: SocialProfileFields
): PublicProfileSocialCardData {
  const name = cleanSocialText(profile.name, 48) || "Pet";
  const species = cleanOptionalSocialText(getPetTypeLabel(profile), 36);
  const breed = cleanOptionalSocialText(profile.breed, 56);
  const ageLabel = cleanOptionalSocialText(profile.ageLabel, 48);
  const summary = [species, breed, ageLabel].filter(Boolean).join("  •  ");

  return {
    ageLabel,
    coverUrl: profile.coverUrl?.trim() || undefined,
    initial:
      cleanSocialText(profile.photoInitial, 2).slice(0, 1).toUpperCase() ||
      name.slice(0, 1).toUpperCase() ||
      "P",
    lostModeEnabled: profile.lostModeEnabled,
    name,
    photoUrl: profile.photoUrl?.trim() || undefined,
    summary,
  };
}

export function getPublicProfileShareVersion(profile: SocialProfileFields) {
  const serverVersion = profile.publicProfileVersion?.trim().toLowerCase();
  if (serverVersion && /^[a-z0-9]{8,64}$/.test(serverVersion)) {
    return serverVersion;
  }

  const visibility = Object.entries(profile.visibility)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value ? 1 : 0}`)
    .join(",");
  const source = [
    profile.name,
    profile.species,
    profile.customSpecies ?? "",
    profile.breed,
    profile.ageLabel,
    profile.photoUrl,
    profile.coverUrl,
    profile.lostModeEnabled ? "lost" : "regular",
    profile.lifecycleStatus,
    visibility,
  ].join("\u001f");

  return fnv1a(source).toString(36);
}

export function getPublicProfileSocialImagePath(profile: SocialProfileFields) {
  const slug = getPublicProfileSlug(profile.publicProfilePath);
  const version = getPublicProfileShareVersion(profile);
  return `/social/pets/${encodeURIComponent(slug)}.jpg?v=${version}`;
}

export function getPublicProfileShareCardImagePath(
  profile: SocialProfileFields,
  variant: PetShareCardVariant = "profile"
) {
  const queryVariant = variant === "profile" ? "share-card" : variant;
  return `${getPublicProfileSocialImagePath(profile)}&variant=${queryVariant}`;
}

export function getAvailablePetShareCardOptions(
  profile: OccasionSocialProfileFields,
  now: Date = new Date()
) {
  return [
    {
      variant: "profile" as const,
      label: "Profile",
      imagePath: getPublicProfileShareCardImagePath(profile, "profile"),
    },
    ...derivePetOccasions(profile, now).map((occasion) => ({
      variant: occasion.variant,
      label: occasion.label,
      imagePath: getPublicProfileShareCardImagePath(profile, occasion.variant),
    })),
  ];
}

export function getPetShareCardFileName(
  petName: string,
  variant: PetShareCardVariant = "profile"
) {
  const safeName = cleanSocialText(petName, 48)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const suffix = variant === "profile" ? "share-card" : `${variant}-card`;
  return `mypetlink-${safeName || "pet"}-${suffix}.jpg`;
}

export function addPublicProfileShareVersion(path: string, version?: string) {
  if (!version?.trim()) return path;

  try {
    const absolute = /^https:\/\//i.test(path);
    const url = new URL(path, "https://mypetlink.invalid");
    url.searchParams.set("share", version.trim());

    return absolute
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

function getPublicProfileSlug(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const slug = pathname.split("/").filter(Boolean).at(-1) ?? "pet-profile";
  return /^[a-z0-9-]+$/i.test(slug) ? slug.toLowerCase() : "pet-profile";
}

function cleanOptionalSocialText(value: string | undefined, maxLength: number) {
  const cleaned = cleanSocialText(value, maxLength);
  return unavailableValues.has(cleaned.toLowerCase()) ? undefined : cleaned;
}

function cleanSocialText(value: string | undefined, maxLength: number) {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
