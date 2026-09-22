import {
  getCountedPetProfiles as getLifecycleCountedPetProfiles,
  type PetLifecycleLike,
} from "@/lib/petLifecycle";
import { publicCommerceAvailability } from "@/lib/publicCommerceAvailability";

export const phase1Positioning =
  "Create a free pet profile first. Add the QR + NFC Smart Tag when you want extra safety. Premium care features are coming soon.";

// Baseline Free-plan values used when the app runs on local data only. When
// the MyPetLink service is connected, the owner's real plan limits (the same
// values the service enforces) are adopted via adoptServerPlanLimits and take
// precedence everywhere below.
export const freePlanLimits = {
  planName: "Free",
  maxPets: 3,
  maxMemoriesPerPet: 10,
  basicCareRecords: true,
  qrSafetyPage: true,
  publicShareProfile: true,
  basicLostMode: true,
  basicQrDownload: true,
  smartTagAddOnAllowed: true,
} as const;

export type EffectivePlanLimits = {
  planName: string;
  maxPets: number;
  maxMemoriesPerPet: number;
};

let serverPlanLimits: EffectivePlanLimits | null = null;

// Called whenever the owner's profile is loaded from the service, so every
// limit check and usage meter in the portal reflects the enforced plan.
export function adoptServerPlanLimits(
  plan?: {
    name?: string | null;
    maxPets?: number | null;
    maxMemoriesPerPet?: number | null;
  } | null
) {
  if (!plan || !plan.maxPets || plan.maxPets <= 0 || !plan.maxMemoriesPerPet || plan.maxMemoriesPerPet <= 0) {
    return;
  }

  serverPlanLimits = {
    planName: plan.name || freePlanLimits.planName,
    maxPets: plan.maxPets,
    maxMemoriesPerPet: plan.maxMemoriesPerPet,
  };
}

export function getEffectivePlanLimits(): EffectivePlanLimits {
  return (
    serverPlanLimits ?? {
      planName: freePlanLimits.planName,
      maxPets: freePlanLimits.maxPets,
      maxMemoriesPerPet: freePlanLimits.maxMemoriesPerPet,
    }
  );
}

export const premiumPlan = {
  name: "Premium Plan",
  status: "Coming Soon",
  description:
    "For owners with multiple pets, richer Moments, reminders, family access, scan history, and advanced care tools.",
  features: [
    "More pet profiles",
    "More or unlimited Moments",
    "Photo and video albums",
    "Care reminders",
    "Scan history",
    "Found location reports",
    "Family access",
    "Document upload",
    "Advanced themes",
    "Advanced care records",
  ],
} as const;

// The QR + NFC Smart Tag is the only physical tag MyPetLink offers. Every
// public page describes this one product, so there is nothing to compare and
// no second price to keep in step.
export const smartTagAddOn = {
  name: "MyPetLink QR + NFC Smart Tag",
  shortName: "QR + NFC smart tag",
  /**
   * The customer-facing retail price, and the only place it is written.
   *
   * Every public surface reads this — the landing page, pricing, Where to Buy,
   * the Smart Tag showcase — so a price cannot be right on one page and stale
   * on another. It is deliberately NOT what an order is charged: order lines
   * take their amounts from the tag catalogue in the database, and merchant
   * sales from their own WholesaleUnitPrice. Retail display, order pricing and
   * wholesale are three separate facts and must not collapse into one constant.
   *
   * The seeded AppSetting `tag.qr_nfc.price` holds the same figure and is
   * admin-editable, but nothing reads it today. If that is ever wired up it
   * should replace this constant rather than sit beside it.
   */
  price: "RM39.90",
  billingNote: "one-time",
  description:
    "A QR + NFC smart tag where scan and tap open the same Safety Profile.",
  accessMethods: [
    "Scan the QR code with any phone camera",
    "Tap it with an NFC-capable phone",
  ],
} as const;

/**
 * Marketing status for the physical Smart Tag add-on.
 *
 * Derived from the same availability rule that decides whether Where to Buy is
 * offered, rather than being a second hardcoded string beside it. Those two
 * could previously disagree: turning ordering on would have published a buying
 * guide while every other page still said "Coming Soon".
 */
export const smartTagAddOnsStatus = {
  status: publicCommerceAvailability.onlineOrderingAvailable
    ? "Available now"
    : "Coming Soon",
  price: smartTagAddOn.price,
  shortDescription: publicCommerceAvailability.onlineOrderingAvailable
    ? "A one-time QR + NFC smart pet tag add-on."
    : "A one-time QR + NFC smart pet tag add-on, coming soon.",
} as const;

export const gpsSafety = {
  name: "GPS Safety",
  status: "Coming Later",
  description:
    "GPS tracking is planned for a later phase and is not part of the current smart tag add-on.",
} as const;

export function getPetLimitState(petCount: number) {
  const { planName, maxPets: max } = getEffectivePlanLimits();
  const isAtLimit = petCount >= max;
  const isOverLimit = petCount > max;

  return {
    count: petCount,
    max,
    canCreate: petCount < max,
    isAtLimit,
    isOverLimit,
    usageLabel: isOverLimit
      ? `${planName} plan - ${petCount} pet profiles saved during early access`
      : `${planName} plan - ${petCount} of ${max} pet profiles used`,
    message: isOverLimit
      ? "You're currently above the new Free limit because you joined during early access. Your existing pet profiles remain active. New profiles may require Premium when it becomes available."
      : "You've reached the Free profile limit. Premium plans for more pets are coming soon. Your existing pet profiles remain active.",
  };
}

export function getCountedPetProfiles<T extends PetLifecycleLike>(pets: T[]) {
  return getLifecycleCountedPetProfiles(pets);
}

export function getPetLimitStateFromPets<T extends PetLifecycleLike>(pets: T[]) {
  return getPetLimitState(getCountedPetProfiles(pets).length);
}

export function getMemoryLimitState(memoryCount: number) {
  const max = getEffectivePlanLimits().maxMemoriesPerPet;
  const isAtLimit = memoryCount >= max;
  const isOverLimit = memoryCount > max;

  return {
    count: memoryCount,
    max,
    canCreate: memoryCount < max,
    isAtLimit,
    isOverLimit,
    usageLabel: isOverLimit
      ? `${memoryCount} Moments saved during early access`
      : `${memoryCount} of ${max} Moments used`,
    message: isOverLimit
      ? "You're currently above the new Free Moment limit because you joined during early access. Existing Moments stay safe and editable. New Moments may require Premium when it becomes available."
      : "You've reached the Free Moment limit for this pet. Premium albums and more Moments are coming soon. Your existing Moments remain safe.",
  };
}
