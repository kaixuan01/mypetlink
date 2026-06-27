import { mockPets } from "@/data/mockPets";
import type { Pet, PetTag } from "@/types";

// Central route map for MyPetLink so every page links consistently.
//
// Route rules:
// - Owner portal: /pets/{petId}/...        (always the petId, never the slug)
// - Physical tag: /t/{tagCode}             (QR + NFC point here)
// - Activation:   /activate/{tagCode}      (Unassigned tag binding flow)
// - Public share: /p/{petSlug}-{publicCode} (looked up by publicCode)

type TagOrderOptions = {
  type?: "qr" | "nfc";
  replacementFor?: string;
};

export const ownerRoutes = {
  dashboard: "/dashboard",
  pets: "/pets",
  petNew: "/pets/new",
  moments: "/moments",
  records: "/records",
  tags: "/tags",
  orders: "/orders",
  settings: "/settings",
  petProfile: (petId: string) => `/pets/${petId}`,
  petEdit: (petId: string) => `/pets/${petId}/edit`,
  petRecords: (petId: string) => `/pets/${petId}/records`,
  petMoments: (petId: string) => `/pets/${petId}/moments`,
  petMomentNew: (petId: string) => `/pets/${petId}/moments/new`,
  petTimeline: (petId: string) => `/pets/${petId}/timeline`,
  petQr: (petId: string) => `/pets/${petId}/qr`,
  petTags: (petId: string) => `/pets/${petId}/tags`,
  petTagOrder: (petId: string, options: TagOrderOptions = {}) => {
    const params = new URLSearchParams();

    if (options.type) {
      params.set("type", options.type);
    }

    if (options.replacementFor) {
      params.set("replacementFor", options.replacementFor);
    }

    const query = params.toString();
    return `/pets/${petId}/tags/order${query ? `?${query}` : ""}`;
  },
};

export function tagPath(tagCode: string) {
  return `/t/${tagCode}`;
}

export function activatePath(tagCode: string) {
  return `/activate/${tagCode}`;
}

export function publicProfilePath(slug: string, publicCode: string) {
  return `/p/${slug}-${publicCode}`.toLowerCase();
}

// Canonical helper for the shareable public profile of a pet.
// Always /p/{petSlug}-{publicCode}; never the slug alone.
export function getPublicProfilePath(pet: Pick<Pet, "slug" | "publicCode">) {
  return publicProfilePath(pet.slug, pet.publicCode);
}

// Canonical helper for the QR/NFC safety page of a physical tag.
// Always /t/{tagCode}; never an internal id or old short token.
export function getTagScanPath(tag: Pick<PetTag, "tagCode">) {
  return tagPath(tag.tagCode);
}

// The public param is "{slug}-{publicCode}". A slug can contain hyphens
// (e.g. "milo-the-dog"), so the publicCode is always the final segment.
export function parsePublicProfileParam(param: string) {
  const value = param.trim();
  const index = value.lastIndexOf("-");

  if (index <= 0) {
    return { slug: value, publicCode: "" };
  }

  return {
    slug: value.slice(0, index),
    publicCode: value.slice(index + 1),
  };
}

// First seeded pet, used for marketing/sample demo links so they always
// resolve to a real generated profile and tag.
export const samplePet = mockPets[0];
