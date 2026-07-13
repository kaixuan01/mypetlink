import { samplePet } from "@/data/samplePet";
import type { Pet, PetTag } from "@/types";

// Central route map for MyPetLink so every page links consistently.
//
// Route rules:
// - Owner portal: /pets/{petId}/...        (always the petId, never the slug)
// - QR safety:   /q/{safetyCode}           (pet-level finder safety page)
// - Physical tag: /t/{tagCode}             (physical QR or QR + NFC scan link)
// - Activation:   /t/{tagCode}             (scan/tap entry point for activation)
// - Public share: /p/{petSlug}-{publicCode} (looked up by publicCode)

type TagOrderOptions = {
  type?: "qr" | "nfc";
  replacementFor?: string;
};

type PetRecordsOptions = {
  create?: boolean;
};

export const ownerRoutes = {
  dashboard: "/dashboard",
  pets: "/pets",
  petNew: "/pets/new",
  moments: "/moments",
  records: "/records",
  tags: "/tags",
  orders: "/orders",
  // Static-export safe: a single /orders/view page reads the order number from
  // the query string, so it works for any order (including runtime-created
  // orders that were never pre-rendered).
  orderDetail: (orderNumber: string) =>
    `/orders/view?order=${encodeURIComponent(orderNumber)}`,
  settings: "/settings",
  petProfile: (petId: string) => `/pets/${petId}`,
  petEdit: (petId: string) => `/pets/${petId}/edit`,
  petRecords: (petId: string, options: PetRecordsOptions = {}) =>
    `/pets/${petId}/records${options.create ? "?create=1" : ""}`,
  petMoments: (petId: string) => `/pets/${petId}/moments`,
  petMomentNew: (petId: string) => `/pets/${petId}/moments/new`,
  petTimeline: (petId: string) => `/pets/${petId}/timeline`,
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

export function qrSafetyPath(safetyCode: string) {
  return `/q/${safetyCode}`;
}

export function activatePath(tagCode: string) {
  return tagPath(tagCode);
}

export function publicProfilePath(slug: string, publicCode: string) {
  return `/p/${slug}-${publicCode}`.toLowerCase();
}

// Canonical helper for the shareable public profile of a pet.
// Always /p/{petSlug}-{publicCode}; never the slug alone.
export function getPublicProfilePath(pet: Pick<Pet, "slug" | "publicCode">) {
  return publicProfilePath(pet.slug, pet.publicCode);
}

// Canonical helper for the pet-level QR Safety Page.
// Always /q/{safetyCode}; never a physical tagCode.
export function getQrSafetyPath(pet: Pick<Pet, "safetyCode">) {
  return qrSafetyPath(pet.safetyCode);
}

// Canonical helper for the physical tag scan link.
// Always /t/{tagCode}; active tags open safety content, inactive tags do not.
export function getTagScanPath(tag: Pick<PetTag, "tagCode">) {
  return tagPath(tag.tagCode);
}

export const publicRoutes = {
  publicProfile: (pet: Pick<Pet, "slug" | "publicCode">) =>
    getPublicProfilePath(pet),
  qrSafetyPage: (pet: Pick<Pet, "safetyCode">) => getQrSafetyPath(pet),
  physicalTag: (tag: Pick<PetTag, "tagCode">) => getTagScanPath(tag),
};

export const authRoutes = {
  ownerLogin: "/login",
  adminLogin: "/admin/login",
} as const;

export const marketingRoutes = {
  home: "/",
  pricing: "/pricing",
  howItWorks: "/how-it-works",
  smartPetTags: "/smart-pet-tags",
  petProfile: "/pet-profile",
  sample: "/sample",
  privacy: "/privacy",
  terms: "/terms",
} as const;

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

export { samplePet };
