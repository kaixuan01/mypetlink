import { describe, expect, it } from "vitest";
import type { CareRecord } from "@/types";
import {
  isCareRecordPublic,
  normalizeCareRecordVisibility,
  toCareRecordAudience,
} from "./careRecordVisibility";

describe("Care record visibility", () => {
  it.each([
    ["Private", "Private", false],
    ["Public badge only", "Public badge only", true],
    ["PublicBadgeOnly", "Public badge only", true],
    ["Public details", "Public badge only", true],
    ["PublicDetails", "Public badge only", true],
    [undefined, "Private", false],
    [null, "Private", false],
  ] as const)(
    "normalizes %s to %s with public eligibility %s",
    (input, normalized, isPublic) => {
      expect(normalizeCareRecordVisibility(input)).toBe(normalized);
      expect(isCareRecordPublic(input)).toBe(isPublic);
      expect(toCareRecordAudience(input)).toBe(
        isPublic ? "Public" : "Private"
      );
    }
  );

  it("fails closed for an unexpected runtime value", () => {
    const corruptVisibility =
      "UnexpectedFutureValue" as CareRecord["publicVisibility"];

    expect(normalizeCareRecordVisibility(corruptVisibility)).toBe("Private");
    expect(isCareRecordPublic(corruptVisibility)).toBe(false);
    expect(toCareRecordAudience(corruptVisibility)).toBe("Private");
  });
});
