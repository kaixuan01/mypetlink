export const MINIMUM_PET_BIRTH_YEAR = 1900;

export type PetAgeMode =
  | "ExactBirthday"
  | "EstimatedBirthYear"
  | "Unknown";

export type PetAgeSource = PetAgeMode;

export type PetAgeInfo = {
  source: PetAgeSource;
  ageInYears: number | null;
  displayLabel: string;
};

export type PetAgeInput = {
  birthday?: string | null;
  estimatedBirthYear?: number | null;
};

export type PetAgeFormValues = {
  birthdayDate: string;
  estimatedBirthYear: string;
};

const MONTHS = [
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
] as const;

export function calculatePetAge(
  pet: PetAgeInput,
  referenceDate: Date = new Date()
): PetAgeInfo {
  const reference = toUtcDateParts(referenceDate);
  const birthday = parsePetBirthday(pet.birthday);

  if (
    birthday &&
    birthday.year >= MINIMUM_PET_BIRTH_YEAR &&
    compareDateParts(birthday, reference) <= 0
  ) {
    let age = reference.year - birthday.year;
    if (
      reference.month < birthday.month ||
      (reference.month === birthday.month && reference.day < birthday.day)
    ) {
      age -= 1;
    }

    return {
      source: "ExactBirthday",
      ageInYears: Math.max(0, age),
      displayLabel: age < 1 ? "Under 1 year old" : formatYears(age),
    };
  }

  const estimatedBirthYear = Number(pet.estimatedBirthYear);
  if (
    Number.isInteger(estimatedBirthYear) &&
    estimatedBirthYear >= MINIMUM_PET_BIRTH_YEAR &&
    estimatedBirthYear <= reference.year
  ) {
    const age = reference.year - estimatedBirthYear;
    return {
      source: "EstimatedBirthYear",
      ageInYears: age,
      displayLabel:
        age < 1 ? "Under 1 year old" : `About ${formatYears(age)}`,
    };
  }

  return {
    source: "Unknown",
    ageInYears: null,
    displayLabel: "Age unknown",
  };
}

export function getPetAgeMode(pet: PetAgeInput): PetAgeMode {
  const birthday = pet.birthday?.trim() ?? "";
  if (birthday && birthday !== "Not set" && !/^estimated/i.test(birthday)) {
    return "ExactBirthday";
  }

  if (Number.isInteger(Number(pet.estimatedBirthYear))) {
    return "EstimatedBirthYear";
  }

  return "Unknown";
}

export function applyPetAgeMode(
  mode: PetAgeMode,
  values: PetAgeFormValues
): PetAgeFormValues {
  if (mode === "ExactBirthday") {
    return { birthdayDate: values.birthdayDate, estimatedBirthYear: "" };
  }

  if (mode === "EstimatedBirthYear") {
    return { birthdayDate: "", estimatedBirthYear: values.estimatedBirthYear };
  }

  return { birthdayDate: "", estimatedBirthYear: "" };
}

export function getEstimatedBirthYearOptions(referenceDate: Date = new Date()) {
  const currentYear = referenceDate.getUTCFullYear();
  return Array.from(
    { length: currentYear - MINIMUM_PET_BIRTH_YEAR + 1 },
    (_, index) => currentYear - index
  );
}

export function parsePetBirthday(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "Not set" || /^estimated/i.test(trimmed)) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return validDateParts(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  const displayMatch = trimmed.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (!displayMatch) {
    return null;
  }

  const month = MONTHS.indexOf(displayMatch[2] as (typeof MONTHS)[number]) + 1;
  return validDateParts(Number(displayMatch[3]), month, Number(displayMatch[1]));
}

function validDateParts(year: number, month: number, day: number) {
  if (month < 1 || day < 1) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function toUtcDateParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function compareDateParts(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number }
) {
  return (
    left.year - right.year || left.month - right.month || left.day - right.day
  );
}

function formatYears(age: number) {
  return age === 1 ? "1 year old" : `${age} years old`;
}
