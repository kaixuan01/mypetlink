import { describe, expect, it } from "vitest";
import {
  careRecordTypes,
  newCareRecordTypes,
  getCareRecordDateTerminology,
  getLocalTodayDateInputValue,
  isFutureCareRecordDate,
  isValidDateInputValue,
} from "./careRecordTerminology";

describe("care record date terminology", () => {
  it("covers every Care Record type used by the form", () => {
    expect(careRecordTypes).toEqual([
      "Vaccine",
      "Deworming",
      "Grooming",
      "Vet Visit",
      "Medication",
      "Allergy",
      "Surgery",
      "Lab Test",
      "Other",
    ]);
  });

  it("keeps Allergy only for legacy record compatibility", () => {
    expect(careRecordTypes).toContain("Allergy");
    expect(newCareRecordTypes).not.toContain("Allergy");
  });

  it("provides record-specific labels, helpers, and validation copy", () => {
    expect(getCareRecordDateTerminology("Grooming")).toMatchObject({
      primaryDateLabel: "Grooming Date",
      nextDateLabel: "Next Grooming Date",
      futureDateValidationMessage:
        "Grooming date cannot be in the future. Use Next Grooming Date to track future care.",
    });

    expect(getCareRecordDateTerminology("Vet Visit")).toMatchObject({
      primaryDateLabel: "Visit Date",
      nextDateLabel: "Next Follow-up Date",
    });
    expect(getCareRecordDateTerminology("Vaccine")).toMatchObject({
      primaryDateLabel: "Vaccination Date",
      nextDateLabel: "Next Vaccination Due Date",
    });

    for (const type of careRecordTypes) {
      const terminology = getCareRecordDateTerminology(type);
      expect(
        [
          terminology.primaryDateHelper,
          terminology.nextDateHelper,
          terminology.futureDateValidationMessage,
        ].join(" ")
      ).not.toMatch(/remind|notif/i);
    }
  });

  it("uses safe fallback terminology before a type is chosen", () => {
    expect(getCareRecordDateTerminology("")).toMatchObject({
      primaryDateLabel: "Record Date",
      nextDateLabel: "Next Care Date",
    });
  });

  it("compares valid date-only values against the local calendar date", () => {
    const today = getLocalTodayDateInputValue(new Date(2026, 6, 15, 23, 30));

    expect(today).toBe("2026-07-15");
    expect(isValidDateInputValue("2026-02-28")).toBe(true);
    expect(isValidDateInputValue("2026-02-31")).toBe(false);
    expect(isFutureCareRecordDate("2026-07-15", today)).toBe(false);
    expect(isFutureCareRecordDate("2026-07-16", today)).toBe(true);
  });
});
