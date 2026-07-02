import type { Pet, PetSpecies, PublicPetProfile } from "@/types";

type PetLike = Pick<
  Pet | PublicPetProfile,
  "species" | "breed" | "ageLabel" | "birthday"
> & {
  customSpecies?: string;
  estimatedAge?: string;
};

export const PET_TYPE_OPTIONS: PetSpecies[] = [
  "Dog",
  "Cat",
  "Rabbit",
  "Bird",
  "Hamster",
  "Guinea Pig",
  "Fish",
  "Turtle",
  "Tortoise",
  "Reptile",
  "Snake",
  "Lizard",
  "Ferret",
  "Hedgehog",
  "Sugar Glider",
  "Chinchilla",
  "Horse",
  "Other",
];

export const ESTIMATED_AGE_OPTIONS = [
  { value: "under-1", label: "Under 1 year", displayLabel: "Estimated under 1 year" },
  ...Array.from({ length: 14 }, (_, index) => {
    const years = index + 1;
    return {
      value: String(years),
      label: years === 1 ? "1 year" : `${years} years`,
      displayLabel: years === 1 ? "Estimated 1 year" : `Estimated ${years} years`,
    };
  }),
  { value: "15-plus", label: "15+ years", displayLabel: "Estimated 15+ years" },
  { value: "unknown", label: "Unknown", displayLabel: "Age unknown" },
] as const;

export type EstimatedAgeValue = (typeof ESTIMATED_AGE_OPTIONS)[number]["value"];

const estimatedAgeMap = new Map(
  ESTIMATED_AGE_OPTIONS.map((option) => [option.value, option])
);

export function getPetTypeLabel(pet: Pick<PetLike, "species" | "customSpecies">) {
  const customType = pet.customSpecies?.trim();
  return pet.species === "Other" && customType ? customType : pet.species;
}

export function getPetAgeLabel(
  pet: Pick<PetLike, "birthday" | "ageLabel" | "estimatedAge">
) {
  const birthdayDate = parsePetDate(pet.birthday);

  if (birthdayDate) {
    return buildAgeLabelFromDate(birthdayDate);
  }

  return normalizeEstimatedAgeLabel(pet.estimatedAge || pet.ageLabel);
}

export function getPetSummaryLabel(pet: PetLike) {
  return [getPetTypeLabel(pet), pet.breed, getPetAgeLabel(pet)]
    .filter((value) => value && value !== "Not set")
    .join(" - ");
}

export function getPetSafetySummaryLabel(pet: PetLike) {
  return [getPetTypeLabel(pet), pet.breed, getPetAgeLabel(pet)]
    .filter((value) => value && value !== "Not set")
    .join(" - ");
}

export function formatEstimatedAgeLabel(value: string) {
  const option = estimatedAgeMap.get(value);
  return option?.displayLabel ?? normalizeEstimatedAgeLabel(value);
}

export function parseEstimatedAgeValue(value: string): EstimatedAgeValue {
  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized === "not set" || normalized === "age not set") {
    return "unknown";
  }

  if (normalized.includes("under 1") || normalized.includes("under one")) {
    return "under-1";
  }

  if (normalized.includes("15+")) {
    return "15-plus";
  }

  const numberMatch = normalized.match(/\b(\d{1,2})\b/);

  if (numberMatch) {
    const years = Number(numberMatch[1]);

    if (years >= 15) {
      return "15-plus";
    }

    if (years >= 1 && years <= 14) {
      return String(years) as EstimatedAgeValue;
    }
  }

  return "unknown";
}

export function normalizeEstimatedAgeLabel(value: string) {
  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed === "Not set" ||
    trimmed === "Age not set" ||
    /^unknown$/i.test(trimmed)
  ) {
    return "Age unknown";
  }

  const parsed = parseEstimatedAgeValue(trimmed);
  const option = estimatedAgeMap.get(parsed);

  if (option) {
    return option.displayLabel;
  }

  return trimmed;
}

export function parsePetDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "Not set" || /^estimated/i.test(trimmed)) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return getValidDate(trimmed);
  }

  const match = trimmed.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(month);

  if (monthIndex < 0) {
    return null;
  }

  return getValidDate(
    `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`
  );
}

export function buildAgeLabelFromDate(birthday: Date) {
  const today = new Date();

  if (Number.isNaN(birthday.getTime())) {
    return "Age unknown";
  }

  if (birthday.getTime() > today.getTime()) {
    return "Age unknown";
  }

  let years = today.getFullYear() - birthday.getFullYear();
  const monthDiff = today.getMonth() - birthday.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthday.getDate())
  ) {
    years -= 1;
  }

  if (years <= 0) {
    return "Under 1 year";
  }

  return years === 1 ? "1 year old" : `${years} years old`;
}

function getValidDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
