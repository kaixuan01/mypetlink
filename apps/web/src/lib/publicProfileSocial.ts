import { getPetTypeLabel } from "@/lib/petDisplay";
import type { PublicPetProfile } from "@/types";

export const publicProfileSocialImageSize = {
  width: 1200,
  height: 630,
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
