import { getCountedPetProfiles as getLifecycleCountedPetProfiles } from "@/lib/petLifecycle";
import type { Pet } from "@/types";

export const phase1Positioning =
  "Create a free pet profile first. Add a physical QR or QR + NFC smart tag when you want extra safety. Premium care features are coming soon.";

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
    "For owners with multiple pets, richer memories, reminders, family access, scan history, and advanced care tools.",
  features: [
    "More pet profiles",
    "More or unlimited memories",
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

export const smartTagAddOns = [
  {
    name: "MyPetLink QR Pet Tag",
    shortName: "Physical QR tag",
    price: "RM19.90",
    billingNote: "one-time",
    type: "qr",
    description:
      "A physical QR tag that connects to your pet's Safety Profile.",
  },
  {
    name: "MyPetLink QR + NFC Smart Tag",
    shortName: "QR + NFC smart tag",
    price: "RM39.90",
    billingNote: "one-time",
    type: "nfc",
    description:
      "A QR + NFC smart tag where scan and tap open the same Safety Profile.",
  },
] as const;

// Marketing status for the physical Smart Tag add-ons. The tags are not yet
// available to purchase, so public pages present them as "Coming Soon". This is
// the single source of truth for the landing and pricing pages so they never
// disagree on status, price, or copy.
export const smartTagAddOnsStatus = {
  status: "Coming Soon",
  startingPrice: smartTagAddOns[0].price,
  shortDescription:
    "One-time QR and QR + NFC smart pet tag add-ons, coming soon.",
} as const;

export const gpsSafety = {
  name: "GPS Safety",
  status: "Coming Later",
  description:
    "GPS tracking is planned for a later phase and is not part of the current smart tag add-ons.",
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

export function getCountedPetProfiles(pets: Pet[]) {
  return getLifecycleCountedPetProfiles(pets);
}

export function getPetLimitStateFromPets(pets: Pet[]) {
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
      ? `${memoryCount} memories saved during early access`
      : `${memoryCount} of ${max} pet memories used`,
    message: isOverLimit
      ? "You're currently above the new Free memory limit because you joined during early access. Existing memories stay safe and editable. New memories may require Premium when it becomes available."
      : "You've reached the Free memory limit for this pet. Premium albums and more memories are coming soon. Your existing memories remain safe.",
  };
}
