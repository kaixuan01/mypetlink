import type { RecordType } from "@/types";

export const careRecordTypes = [
  "Vaccine",
  "Deworming",
  "Grooming",
  "Vet Visit",
  "Medication",
  "Allergy",
  "Surgery",
  "Lab Test",
  "Other",
] as const satisfies readonly RecordType[];

// Allergy remains in the legacy-compatible type registry so historical rows
// continue to render and edit. New care records are limited to dated events.
export const newCareRecordTypes = careRecordTypes.filter(
  (type): type is Exclude<RecordType, "Allergy"> => type !== "Allergy"
);

export type CareRecordDateTerminology = {
  primaryDateLabel: string;
  primaryDateHelper: string;
  nextDateLabel: string;
  nextDateHelper: string;
  futureDateValidationMessage: string;
};

const premiumReminderMessage =
  "WhatsApp reminders will be available with Premium.";

const fallbackTerminology: CareRecordDateTerminology = {
  primaryDateLabel: "Record Date",
  primaryDateHelper:
    "Record when this care happened. For future care or reminders, use the next date below.",
  nextDateLabel: "Next Care Date",
  nextDateHelper: withPremiumReminder(
    "Set the date for your pet’s next follow-up or routine care."
  ),
  futureDateValidationMessage:
    "Care date cannot be in the future. Use the next care date for future care or reminders.",
};

const terminologyByType: Record<RecordType, CareRecordDateTerminology> = {
  Vaccine: {
    primaryDateLabel: "Vaccination Date",
    primaryDateHelper:
      "Record when this vaccination was given. Use the next vaccination date below for future reminders.",
    nextDateLabel: "Next Vaccination Due Date",
    nextDateHelper: withPremiumReminder(
      "Set the date when your pet’s next vaccination is due."
    ),
    futureDateValidationMessage:
      "Vaccination date cannot be in the future. Use Next Vaccination Due Date for future reminders.",
  },
  Deworming: {
    primaryDateLabel: "Deworming Date",
    primaryDateHelper:
      "Record when this treatment was given. Use the next deworming date below for future reminders.",
    nextDateLabel: "Next Deworming Due Date",
    nextDateHelper: withPremiumReminder(
      "Set the date when your pet’s next deworming treatment is due."
    ),
    futureDateValidationMessage:
      "Deworming date cannot be in the future. Use Next Deworming Due Date for future care or reminders.",
  },
  Grooming: {
    primaryDateLabel: "Grooming Date",
    primaryDateHelper:
      "Record when this grooming happened. Use the next grooming date below for future care or reminders.",
    nextDateLabel: "Next Grooming Date",
    nextDateHelper: withPremiumReminder(
      "Set the date for your pet’s next grooming session."
    ),
    futureDateValidationMessage:
      "Grooming date cannot be in the future. Use Next Grooming Date for future care or reminders.",
  },
  "Vet Visit": {
    primaryDateLabel: "Visit Date",
    primaryDateHelper:
      "Record when this vet visit happened. Use the next follow-up date below for future care or reminders.",
    nextDateLabel: "Next Follow-up Date",
    nextDateHelper: withPremiumReminder(
      "Set the date for your pet’s next follow-up visit."
    ),
    futureDateValidationMessage:
      "Visit date cannot be in the future. Use Next Follow-up Date for future care or reminders.",
  },
  Medication: {
    primaryDateLabel: "Start Date",
    primaryDateHelper:
      "Record when this medication started. Use the next review date below for future reminders.",
    nextDateLabel: "Next Review Date",
    nextDateHelper: withPremiumReminder(
      "Set the date for your pet’s next medication review."
    ),
    futureDateValidationMessage:
      "Start date cannot be in the future. Use Next Review Date for future care or reminders.",
  },
  Allergy: fallbackTerminology,
  Surgery: {
    primaryDateLabel: "Surgery Date",
    primaryDateHelper:
      "Record when this surgery took place. Use the next follow-up date below for future reminders.",
    nextDateLabel: "Next Follow-up Date",
    nextDateHelper: withPremiumReminder(
      "Set the date for your pet’s next post-surgery follow-up."
    ),
    futureDateValidationMessage:
      "Surgery date cannot be in the future. Use Next Follow-up Date for future care or reminders.",
  },
  "Lab Test": {
    primaryDateLabel: "Test Date",
    primaryDateHelper:
      "Record when this lab test happened. Use the next follow-up date below for future care or reminders.",
    nextDateLabel: "Next Follow-up Date",
    nextDateHelper: withPremiumReminder(
      "Set the date for your pet’s next follow-up or repeat test."
    ),
    futureDateValidationMessage:
      "Test date cannot be in the future. Use Next Follow-up Date for future care or reminders.",
  },
  Other: fallbackTerminology,
};

export function getCareRecordDateTerminology(
  type?: RecordType | "" | null
): CareRecordDateTerminology {
  return type ? terminologyByType[type] ?? fallbackTerminology : fallbackTerminology;
}

export function getLocalTodayDateInputValue(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function isValidDateInputValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return (
    parsed.getFullYear() === Number(year) &&
    parsed.getMonth() === Number(month) - 1 &&
    parsed.getDate() === Number(day)
  );
}

export function isFutureCareRecordDate(
  value: string,
  today = getLocalTodayDateInputValue()
) {
  return isValidDateInputValue(value) && value > today;
}

function withPremiumReminder(message: string) {
  return `${message} ${premiumReminderMessage}`;
}
