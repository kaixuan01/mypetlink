import { mockPets } from "@/data/mockPets";
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
  petRecords: (petId: string) => `/pets/${petId}/records`,
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

// Landing-page / marketing sample pet ("Topu"). This is intentionally separate
// from the Owner Portal demo data (mockPets) so the portal preview is unchanged.
// The slug, publicCode, and safetyCode match the real published sample profile,
// so the "View Sample Public Profile" and "View Sample QR Safety Page" links
// resolve to the live pages:
//   /p/topu-pnpr4ipnr6ppelnsn   and   /q/sl3j2b2q3e2oqhe4iamqa
export const samplePet: Pet = {
  ...mockPets[0],
  id: "sample_topu",
  slug: "topu",
  name: "Topu",
  photoInitial: "T",
  publicCode: "pnpr4ipnr6ppelnsn",
  safetyCode: "sl3j2b2q3e2oqhe4iamqa",
  qrSafetyPath: "/q/sl3j2b2q3e2oqhe4iamqa",
  finderProfileUrl: "/q/sl3j2b2q3e2oqhe4iamqa",
  publicProfilePath: "/p/topu-pnpr4ipnr6ppelnsn",
  bio: "Topu is a gentle rescue dog who loves evening walks, belly rubs, and watching rain from the balcony.",
  emergencyNote:
    "If Topu looks distressed, keep him shaded and avoid feeding unfamiliar treats.",
  lostMode: {
    ...mockPets[0].lostMode,
    lostMessage:
      "Topu is currently missing. If you have found Topu, please contact the owner immediately.",
  },
  owner: {
    ...mockPets[0].owner,
    name: "Topu's owner",
  },
};
