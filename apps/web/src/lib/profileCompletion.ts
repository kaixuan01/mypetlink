import { defaultOwnerSettings, type OwnerSettings } from "@/lib/ownerSettings";
import { isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import { hasUsableSafetyContact } from "@/lib/safetyProfile";
import type { Pet, PetListItem } from "@/types";

export type ProfileCompletionItemId =
  | "photo"
  | "basics"
  | "personality"
  | "birthday"
  | "moment"
  | "contact"
  | "bio"
  | "care_record";

export type ProfileCompletionItem = {
  id: ProfileCompletionItemId;
  weight: number;
  isComplete: boolean;
  label: string;
  actionLabel: string;
  href: string;
};

export type ProfileCompletionInput = {
  pet: Pet | PetListItem;
  momentCount?: number;
  careRecordCount?: number;
  ownerSettings?: OwnerSettings;
  safetyProfilesEnabled?: boolean;
  publicProfilesEnabled?: boolean;
  memoryLimit?: number;
};

export type ProfileCompletionResult = {
  percentage: number;
  items: ProfileCompletionItem[];
  isComplete: boolean;
  isReadyToShare: boolean;
  completedWeight: number;
  applicableWeight: number;
};

export function orderProfileCompletionItemsByWeight(
  items: readonly ProfileCompletionItem[]
) {
  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort(
      (left, right) =>
        right.item.weight - left.item.weight ||
        left.originalIndex - right.originalIndex
    )
    .map(({ item }) => item);
}

function hasText(value: string | undefined) {
  const text = value?.trim() ?? "";
  return Boolean(text) && text.toLowerCase() !== "not set";
}

function hasRealDate(value: string | undefined) {
  return hasText(value) && !Number.isNaN(Date.parse(value as string));
}

function hasOwnerWrittenBio(pet: Pet | PetListItem) {
  const bio = pet.bio?.trim() ?? "";
  const legacyDisplayFallback =
    `${pet.name} has a safe MyPetLink profile ready for family and friends.`;
  return hasText(bio) && bio !== legacyDisplayFallback;
}

/**
 * Derives owner guidance entirely from data already available to the caller.
 * Missing count data means that item is unavailable and is excluded from both
 * sides of the calculation, so a failed request never looks like missing work.
 */
export function deriveProfileCompletion({
  pet,
  momentCount,
  careRecordCount,
  ownerSettings = defaultOwnerSettings,
  safetyProfilesEnabled = true,
  publicProfilesEnabled = true,
  memoryLimit = 1,
}: ProfileCompletionInput): ProfileCompletionResult {
  if (isMemorialPet(pet) || isArchivedPet(pet)) {
    return {
      percentage: 0,
      items: [],
      isComplete: false,
      isReadyToShare: false,
      completedWeight: 0,
      applicableWeight: 0,
    };
  }

  const items: ProfileCompletionItem[] = [
    {
      id: "photo",
      weight: 3,
      isComplete: hasText(pet.photoUrl),
      label: "Profile photo",
      actionLabel: `Add ${pet.name}'s profile photo`,
      href: ownerRoutes.petEdit(pet.id, { tab: "appearance" }),
    },
    {
      id: "basics",
      weight: 2,
      isComplete: hasText(pet.breed) && hasText(pet.gender),
      label: "Basic information",
      actionLabel: `Add ${pet.name}'s basic information`,
      href: ownerRoutes.petEdit(pet.id),
    },
    {
      id: "personality",
      weight: 2,
      isComplete:
        Array.isArray(pet.personalityTags) && pet.personalityTags.length > 0,
      label: "Personality",
      actionLabel: `Add ${pet.name}'s personality`,
      href: ownerRoutes.petEdit(pet.id),
    },
    {
      id: "birthday",
      weight: 2,
      isComplete:
        hasRealDate(pet.birthday) ||
        (Number.isInteger(pet.estimatedBirthYear) &&
          (pet.estimatedBirthYear ?? 0) > 0),
      label: "Birthday or age",
      actionLabel: `Add ${pet.name}'s birthday or age`,
      href: ownerRoutes.petEdit(pet.id),
    },
    ...(typeof momentCount === "number" && memoryLimit > 0
      ? [
          {
            id: "moment" as const,
            weight: 3,
            isComplete: Number.isFinite(momentCount) && momentCount >= 1,
            label: "First Moment",
            actionLabel: `Add ${pet.name}'s first Moment`,
            href: ownerRoutes.petMomentCreate(pet.id),
          },
        ]
      : []),
    ...(safetyProfilesEnabled
      ? [
          {
            id: "contact" as const,
            weight: 3,
            isComplete: hasUsableSafetyContact(pet, ownerSettings),
            label: "Contact for finders",
            actionLabel: `Add a contact for finders of ${pet.name}`,
            href: ownerRoutes.petEdit(pet.id, { tab: "contact" }),
          },
        ]
      : []),
    {
      id: "bio",
      weight: 1,
      isComplete: hasOwnerWrittenBio(pet),
      label: "About",
      actionLabel: `Add more about ${pet.name}`,
      href: ownerRoutes.petEdit(pet.id),
    },
    ...(typeof careRecordCount === "number"
      ? [
          {
            id: "care_record" as const,
            weight: 1,
            isComplete:
              Number.isFinite(careRecordCount) && careRecordCount >= 1,
            label: "First care record",
            actionLabel: `Add ${pet.name}'s first care record`,
            href: ownerRoutes.petRecords(pet.id, { create: true }),
          },
        ]
      : []),
  ];

  const completedWeight = items.reduce(
    (sum, item) => sum + (item.isComplete ? item.weight : 0),
    0
  );
  const applicableWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const percentage = applicableWeight
    ? Math.min(
        100,
        Math.max(0, Math.round((completedWeight / applicableWeight) * 100))
      )
    : 0;
  const completeIds = new Set(
    items.filter((item) => item.isComplete).map((item) => item.id)
  );

  return {
    percentage,
    items,
    isComplete: items.length > 0 && items.every((item) => item.isComplete),
    isReadyToShare:
      publicProfilesEnabled &&
      pet.publicProfileEnabled &&
      completeIds.has("photo") &&
      completeIds.has("basics") &&
      completeIds.has("moment"),
    completedWeight,
    applicableWeight,
  };
}
