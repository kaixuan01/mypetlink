import { samplePet } from "@/data/samplePet";
import type { Pet, PetTag } from "@/types";

// Central route map for MyPetLink so every page links consistently.
//
// Route rules:
// - Owner portal: /pets/{petId}/...        (always the petId, never the slug)
// - Safety Profile: /q/{safetyCode}        (pet-level direct safety link)
// - Physical QR:  /q/{tagCode}             (printed QR entry on a Smart Tag)
// - Physical NFC: /n/{tagCode}             (NFC entry on a Smart Tag)
// - Legacy tag:   /t/{tagCode}             (already-manufactured compatibility)
// - Public share: /p/{petSlug}-{publicCode} (looked up by publicCode)

type TagOrderOptions = {
  replacementFor?: string;
};

type TagOrderEntryOptions = TagOrderOptions & {
  petId?: string;
};

type PetRecordsOptions = {
  create?: boolean;
};

type PetMomentsOptions = {
  edit?: "new" | string;
};

export type PetEditTab = "basic" | "appearance" | "public" | "contact";

type PetEditOptions = {
  tab?: PetEditTab;
};

export const ownerRoutes = {
  dashboard: "/dashboard",
  pets: "/pets",
  petNew: "/pets/new",
  moments: "/moments",
  records: "/records",
  tags: "/tags",
  tagOrder: (options: TagOrderEntryOptions = {}) => {
    const params = new URLSearchParams();

    if (options.petId) {
      params.set("petId", options.petId);
    }

    if (options.replacementFor) {
      params.set("replacementFor", options.replacementFor);
    }

    const query = params.toString();
    return `/tags/order${query ? `?${query}` : ""}`;
  },
  petNewForTagOrder: () =>
    `/pets/new?returnTo=${encodeURIComponent("/tags/order")}`,
  orders: "/orders",
  // Static-export safe: a single /orders/view page reads the order number from
  // the query string, so it works for any order (including runtime-created
  // orders that were never pre-rendered).
  orderDetail: (orderNumber: string) =>
    `/orders/view?order=${encodeURIComponent(orderNumber)}`,
  settings: "/settings",
  /**
   * The Community identity, viewed and edited from inside Community.
   *
   * Three routes, three audiences, one implementation. `/community/profile` is
   * the owner's own profile in the Community shell; `/community/profile/edit`
   * is where they change it; `/u/{handle}` is the public page a visitor sees.
   * An owner opening "My profile" used to be sent to the public route, which
   * dropped every piece of Community chrome and made it feel like leaving the
   * product to look at yourself.
   */
  /** The signed-in owner's own Community profile, inside the Community shell. */
  socialProfile: "/community/profile",
  socialProfileEdit: "/community/profile/edit",
  // Deep link straight to the Contact details section of Owner Settings.
  // page (used by Home quick actions and contact reminders).
  settingsOwnerContact: "/settings#owner-contact",
  petProfile: (petId: string) => `/pets/${petId}`,
  petEdit: (petId: string, options: PetEditOptions = {}) =>
    `/pets/${petId}/edit${options.tab ? `?tab=${options.tab}` : ""}`,
  petRecords: (petId: string, options: PetRecordsOptions = {}) =>
    `/pets/${petId}/records${options.create ? "?create=1" : ""}`,
  petMoments: (petId: string, options: PetMomentsOptions = {}) => {
    const params = new URLSearchParams();

    if (options.edit) {
      params.set("edit", options.edit);
    }

    const query = params.toString();
    return `/pets/${petId}/moments${query ? `?${query}` : ""}`;
  },
  petMomentCreate: (petId: string) =>
    ownerRoutes.petMoments(petId, { edit: "new" }),
  // Compatibility URL for previously shared or bookmarked create links.
  // New internal entry points use petMomentCreate so creation opens over the
  // Moments context without a separate route transition.
  petMomentNew: (petId: string) => `/pets/${petId}/moments/new`,
  petTimeline: (petId: string) => `/pets/${petId}/timeline`,
  petTags: (petId: string) => `/pets/${petId}/tags`,
  petTagOrder: (petId: string, options: TagOrderOptions = {}) =>
    ownerRoutes.tagOrder({ petId, ...options }),
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

/**
 * The three social surfaces that are not somebody's profile.
 *
 * Plain routes for now. Phase 1L owns how they are reached from the global
 * navigation; these only have to exist and be linkable.
 */
export const socialRoutes = {
  feed: "/feed",
  explore: "/explore",
  search: "/search",
  notifications: "/notifications",
  searchFor: (query: string) => `/search?q=${encodeURIComponent(query)}`,
  moment: (momentId: string) => momentPath(momentId),
} as const;

/**
 * One Moment, on its own page.
 *
 * The canonical destination for tapping a card, for a like notification, and
 * for sharing a single Moment. The id is the one already printed on every card
 * a visitor can see and acted on by every Like button, so putting it in the
 * address exposes nothing the listing did not — and the route re-asks the whole
 * social visibility question rather than trusting the URL.
 */
export function momentPath(momentId: string) {
  return `/moments/${encodeURIComponent(momentId.trim())}`;
}

/**
 * An owner's public social profile.
 *
 * Handles are stored case-insensitively and served lowercase, so one household
 * has exactly one URL. The edge redirects any other casing here.
 */
export function ownerSocialProfilePath(handle: string) {
  return `/u/${handle.trim().replace(/^@+/, "").toLowerCase()}`;
}

/**
 * A pet's Public Share Profile, from the already-composed public slug the
 * social APIs return.
 *
 * `publicProfilePath` above builds the slug from a pet's own slug and code;
 * this one takes the finished value social listings already carry, so a search
 * result and an Explore card cannot drift into two different spellings of the
 * same address.
 */
export function petPublicProfilePath(publicSlug: string) {
  return `/p/${publicSlug.trim().toLowerCase()}`;
}

export function ownerFollowersPath(handle: string) {
  return `${ownerSocialProfilePath(handle)}/followers`;
}

export function ownerFollowingPath(handle: string) {
  return `${ownerSocialProfilePath(handle)}/following`;
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
  ownerSocialProfile: (handle: string) => ownerSocialProfilePath(handle),
  ownerFollowers: (handle: string) => ownerFollowersPath(handle),
  ownerFollowing: (handle: string) => ownerFollowingPath(handle),
};

export const authRoutes = {
  ownerLogin: "/login",
  adminLogin: "/admin/login",
} as const;

export const adminRoutes = {
  communityReports: "/admin/community-reports",
  productCatalog: "/admin/tag-products",
  pets: "/admin/pets",
  pet: (petId: string) => `/admin/pets?petProfile=${encodeURIComponent(petId)}`,
  owners: "/admin/users",
  owner: (ownerId: string) => `/admin/users?owner=${encodeURIComponent(ownerId)}`,
  petsForOwner: (ownerId: string) => `/admin/pets?ownerId=${encodeURIComponent(ownerId)}`,
  orders: "/admin/orders",
  ordersForOwner: (ownerId: string) => `/admin/orders?ownerId=${encodeURIComponent(ownerId)}`,
  paymentProofs: "/admin/payment-proofs",
  paymentProofsAwaitingReview: "/admin/payment-proofs?status=PendingReview",
  paymentProofsForOwner: (ownerId: string) => `/admin/payment-proofs?ownerId=${encodeURIComponent(ownerId)}`,
  smartTags: "/admin/tags",
  tagInventory: "/admin/tag-inventory",
  smartTag: (tagId: string) => `/admin/tags?tag=${encodeURIComponent(tagId)}`,
  smartTagsForPet: (petId: string) => `/admin/tags?pet=${encodeURIComponent(petId)}`,
  smartTagsForOwner: (ownerId: string) => `/admin/tags?ownerId=${encodeURIComponent(ownerId)}`,
  order: (orderId: string) => `/admin/orders?order=${encodeURIComponent(orderId)}`,
  plans: "/admin/plans",
  merchantSales: "/admin/merchant-sales",
  businessIdentity: "/admin/business-identity",
  deliveryRates: "/admin/delivery-rates",
  shippingFulfilment: "/admin/shipping-fulfilment",
  emailTemplates: "/admin/email-templates",
  orderCheckout: "/admin/order-checkout",
  sampleExperience: "/admin/sample-experience",
  operationalStatus: "/admin/operational-status",
  accessUsers: "/admin/access/users",
  accessUser: (adminUserId: string) =>
    `/admin/access/users?user=${encodeURIComponent(adminUserId)}`,
  accessRoles: "/admin/access/roles",
  accessRole: (roleId: string) => `/admin/access/roles?role=${encodeURIComponent(roleId)}`,
  accessAuditLog: "/admin/access/activity",
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
  // The product page for the finder-facing profile. Product navigation used to
  // point its "Safety Profile" entry at the sample anchor below, which sent
  // somebody who clicked a product name into a demo gallery instead.
  safetyProfile: "/safety-profile",
  sample: "/sample",
  // Public buying guide. Reachable by URL today; public discovery is governed
  // by publicCommerceAvailability so every surface follows the same channels.
  whereToBuy: "/where-to-buy",
  samplePublicProfile: "/sample#public-share-profile",
  sampleSafetyProfile: "/sample#safety-profile",
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
