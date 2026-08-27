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

const fallbackTerminology: CareRecordDateTerminology = {
  primaryDateLabel: "Record Date",
  primaryDateHelper:
    "Record when this care happened. Use the next date below to track future care.",
  nextDateLabel: "Next Care Date",
  nextDateHelper: "Set the date for your pet’s next follow-up or routine care.",
  futureDateValidationMessage:
    "Care date cannot be in the future. Use the next care date to track future care.",
};

export type CareRecordHistoryTerminology = {
  primaryDateLabel: string;
  nextDateLabel: string;
};

export type CareRecordEditorExamples = {
  title: string;
  notes: string;
};

const terminologyByType: Record<RecordType, CareRecordDateTerminology> = {
  Vaccine: {
    primaryDateLabel: "Vaccination Date",
    primaryDateHelper:
      "Record when this vaccination was given. Use the next vaccination date below to track future care.",
    nextDateLabel: "Next Vaccination Due Date",
    nextDateHelper: "Set the date when your pet’s next vaccination is due.",
    futureDateValidationMessage:
      "Vaccination date cannot be in the future. Use Next Vaccination Due Date to track future care.",
  },
  Deworming: {
    primaryDateLabel: "Deworming Date",
    primaryDateHelper:
      "Record when this treatment was given. Use the next deworming date below to track future care.",
    nextDateLabel: "Next Deworming Due Date",
    nextDateHelper:
      "Set the date when your pet’s next deworming treatment is due.",
    futureDateValidationMessage:
      "Deworming date cannot be in the future. Use Next Deworming Due Date to track future care.",
  },
  Grooming: {
    primaryDateLabel: "Grooming Date",
    primaryDateHelper:
      "Record when this grooming happened. Use the next grooming date below to track future care.",
    nextDateLabel: "Next Grooming Date",
    nextDateHelper: "Set the date for your pet’s next grooming session.",
    futureDateValidationMessage:
      "Grooming date cannot be in the future. Use Next Grooming Date to track future care.",
  },
  "Vet Visit": {
    primaryDateLabel: "Visit Date",
    primaryDateHelper:
      "Record when this vet visit happened. Use the next follow-up date below to track future care.",
    nextDateLabel: "Next Follow-up Date",
    nextDateHelper: "Set the date for your pet’s next follow-up visit.",
    futureDateValidationMessage:
      "Visit date cannot be in the future. Use Next Follow-up Date to track future care.",
  },
  Medication: {
    primaryDateLabel: "Start Date",
    primaryDateHelper:
      "Record when this medication started. Use the next review date below to track future care.",
    nextDateLabel: "Next Review Date",
    nextDateHelper: "Set the date for your pet’s next medication review.",
    futureDateValidationMessage:
      "Start date cannot be in the future. Use Next Review Date to track future care.",
  },
  Allergy: fallbackTerminology,
  Surgery: {
    primaryDateLabel: "Surgery Date",
    primaryDateHelper:
      "Record when this surgery took place. Use the next follow-up date below to track future care.",
    nextDateLabel: "Next Follow-up Date",
    nextDateHelper:
      "Set the date for your pet’s next post-surgery follow-up.",
    futureDateValidationMessage:
      "Surgery date cannot be in the future. Use Next Follow-up Date to track future care.",
  },
  "Lab Test": {
    primaryDateLabel: "Test Date",
    primaryDateHelper:
      "Record when this lab test happened. Use the next follow-up date below to track future care.",
    nextDateLabel: "Next Follow-up Date",
    nextDateHelper:
      "Set the date for your pet’s next follow-up or repeat test.",
    futureDateValidationMessage:
      "Test date cannot be in the future. Use Next Follow-up Date to track future care.",
  },
  Other: fallbackTerminology,
};

const fallbackHistoryTerminology: CareRecordHistoryTerminology = {
  primaryDateLabel: "Date",
  nextDateLabel: "Next care",
};

const historyTerminologyByType: Record<
  RecordType,
  CareRecordHistoryTerminology
> = {
  Vaccine: { primaryDateLabel: "Date", nextDateLabel: "Next due" },
  Deworming: { primaryDateLabel: "Date", nextDateLabel: "Next due" },
  Grooming: { primaryDateLabel: "Date", nextDateLabel: "Next due" },
  "Vet Visit": {
    primaryDateLabel: "Date",
    nextDateLabel: "Next follow-up",
  },
  Medication: {
    primaryDateLabel: "Start date",
    nextDateLabel: "Next review",
  },
  Allergy: fallbackHistoryTerminology,
  Surgery: {
    primaryDateLabel: "Date",
    nextDateLabel: "Next follow-up",
  },
  "Lab Test": {
    primaryDateLabel: "Date",
    nextDateLabel: "Next follow-up",
  },
  Other: fallbackHistoryTerminology,
};

const fallbackEditorExamples: CareRecordEditorExamples = {
  title: "e.g. Care record",
  notes: "e.g. Add any useful care details",
};

const editorExamplesByType: Record<RecordType, CareRecordEditorExamples> = {
  Vaccine: {
    title: "e.g. Rabies, DHPP booster",
    notes: "e.g. Booster completed; certificate saved",
  },
  Deworming: {
    title: "e.g. Routine deworming",
    notes: "e.g. Treatment completed; next dose scheduled",
  },
  Grooming: {
    title: "e.g. Full grooming",
    notes: "e.g. Bath, trim, and nail care completed",
  },
  "Vet Visit": {
    title: "e.g. Annual check-up",
    notes: "e.g. Routine examination completed",
  },
  Medication: {
    title: "e.g. Apoquel",
    notes: "e.g. Once daily with food",
  },
  Allergy: {
    title: "e.g. Allergy record",
    notes: "e.g. Details saved for owner reference",
  },
  Surgery: {
    title: "e.g. Spay surgery",
    notes: "e.g. Procedure completed; recovery instructions followed",
  },
  "Lab Test": {
    title: "e.g. Blood test",
    notes: "e.g. Results reviewed with the vet",
  },
  Other: fallbackEditorExamples,
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

export function getCareRecordHistoryTerminology(
  type?: RecordType | "" | null
): CareRecordHistoryTerminology {
  return type
    ? historyTerminologyByType[type] ?? fallbackHistoryTerminology
    : fallbackHistoryTerminology;
}

export function getCareRecordEditorExamples(
  type?: RecordType | "" | null
): CareRecordEditorExamples {
  return type
    ? editorExamplesByType[type] ?? fallbackEditorExamples
    : fallbackEditorExamples;
}

export function getPublicCareTypeLabel(type: RecordType) {
  return type === "Vaccine" ? "Vaccinations" : type;
}
