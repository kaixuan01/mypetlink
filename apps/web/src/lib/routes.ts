import { samplePet } from "@/data/samplePet";
import type { Pet, PetTag } from "@/types";

// Central route map for MyPetLink so every page links consistently.
//
// Route rules:
// - Owner portal: /pets/{petId}/...        (always the petId, never the slug)
// - Safety Profile: /q/{safetyCode}        (pet-level direct safety link)
// - Physical QR:  /q/{tagCode}             (new printed QR entry)
// - Physical NFC: /n/{tagCode}             (new NFC entry)
// - Legacy tag:   /t/{tagCode}             (already-manufactured compatibility)
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
  // Deep link straight to the Owner Contact Details section of the settings
  // page (used by Home quick actions and contact reminders).
  settingsOwnerContact: "/settings#owner-contact",
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

export function tagQrPath(tagCode: string) {
  return `/q/${tagCode}`;
}

export function tagNfcPath(tagCode: string) {
  return `/n/${tagCode}`;
}

export function qrSafetyPath(safetyCode: string) {
  return `/q/${safetyCode}`;
}

export function activatePath(tagCode: string) {
  return tagQrPath(tagCode);
}

export function tagEntryPath(
  tagCode: string,
  source: "qr" | "nfc" | "legacy"
) {
  if (source === "qr") return tagQrPath(tagCode);
  if (source === "nfc") return tagNfcPath(tagCode);
  return tagPath(tagCode);
}

export function publicProfilePath(slug: string, publicCode: string) {
  const normalizedSlug = slug.trim();
  const normalizedCode = publicCode.trim();
  const suffix = `-${normalizedCode}`.toLowerCase();
  const resolvedSlug = normalizedSlug.toLowerCase().endsWith(suffix)
    ? normalizedSlug
    : `${normalizedSlug}-${normalizedCode}`;

  return `/p/${resolvedSlug}`.toLowerCase();
}

// Canonical helper for the shareable public profile of a pet.
// Always /p/{petSlug}-{publicCode}; never the slug alone.
export function getPublicProfilePath(pet: Pick<Pet, "slug" | "publicCode">) {
  return publicProfilePath(pet.slug, pet.publicCode);
}

// Canonical helper for the pet-level Safety Profile.
// Always /q/{safetyCode}; never a physical tagCode.
export function getQrSafetyPath(pet: Pick<Pet, "safetyCode">) {
  return qrSafetyPath(pet.safetyCode);
}

// Canonical helper for a newly produced physical tag's printed QR.
// Existing /t/{tagCode} payloads remain supported through tagPath().
export function getTagScanPath(tag: Pick<PetTag, "tagCode">) {
  return tagQrPath(tag.tagCode);
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

export const adminRoutes = {
  productCatalog: "/admin/tag-products",
  pets: "/admin/pets",
  pet: (petId: string) => `/admin/pets?petProfile=${encodeURIComponent(petId)}`,
  owners: "/admin/users",
  owner: (ownerId: string) => `/admin/users?owner=${encodeURIComponent(ownerId)}`,
  petsForOwner: (ownerId: string) => `/admin/pets?ownerId=${encodeURIComponent(ownerId)}`,
  orders: "/admin/orders",
  ordersForOwner: (ownerId: string) => `/admin/orders?ownerId=${encodeURIComponent(ownerId)}`,
  paymentProofs: "/admin/payment-proofs",
  paymentProofsForOwner: (ownerId: string) => `/admin/payment-proofs?ownerId=${encodeURIComponent(ownerId)}`,
  smartTags: "/admin/tags",
  smartTag: (tagId: string) => `/admin/tags?tag=${encodeURIComponent(tagId)}`,
  smartTagsForPet: (petId: string) => `/admin/tags?pet=${encodeURIComponent(petId)}`,
  smartTagsForOwner: (ownerId: string) => `/admin/tags?ownerId=${encodeURIComponent(ownerId)}`,
  order: (orderId: string) => `/admin/orders?order=${encodeURIComponent(orderId)}`,
  plans: "/admin/plans",
  ownerPlans: "/admin/plans?view=owners",
  ownerPlansForPlan: (planCode: string) =>
    `/admin/plans?view=owners&plan=${encodeURIComponent(planCode)}`,
  ownerPlan: (ownerId: string) =>
    `/admin/plans?view=owners&ownerPlan=${encodeURIComponent(ownerId)}`,
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
