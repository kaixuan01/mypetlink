import { describe, expect, it } from "vitest";
import { derivePetOccasions } from "@/lib/petOccasions";

const activePet = {
  birthday: "2025-08-17",
  lifecycleStatus: "Active" as const,
};

describe("derivePetOccasions", () => {
  it("switches birthday cards at Malaysia midnight", () => {
    expect(
      derivePetOccasions(activePet, new Date("2026-08-16T15:59:59Z"))
    ).toEqual([]);
    expect(
      derivePetOccasions(activePet, new Date("2026-08-16T16:00:00Z"))
    ).toEqual([{ variant: "birthday", count: 1, label: "Birthday" }]);
  });

  it("does not infer a birthday from an estimated year", () => {
    expect(
      derivePetOccasions(
        { ...activePet, birthday: "Estimated 2021" },
        new Date("2026-08-16T16:00:00Z")
      )
    ).toEqual([]);
  });

  it("does not offer cards before or after the matching day", () => {
    expect(
      derivePetOccasions(activePet, new Date("2026-08-15T16:00:00Z"))
    ).toEqual([]);
    expect(
      derivePetOccasions(activePet, new Date("2026-08-17T16:00:00Z"))
    ).toEqual([]);
  });

  it("ignores a historical Adoption Day even when it falls today", () => {
    const petWithHistoricalAdoptionDay = {
      ...activePet,
      birthday: "",
      adoptionDay: "2022-08-17",
    };

    expect(
      derivePetOccasions(
        petWithHistoricalAdoptionDay,
        new Date("2026-08-16T16:00:00Z")
      )
    ).toEqual([]);
  });

  it("keeps leap-day birthdays on February 29", () => {
    const pet = { ...activePet, birthday: "2024-02-29" };
    expect(derivePetOccasions(pet, new Date("2027-02-28T04:00:00Z"))).toEqual([]);
    expect(derivePetOccasions(pet, new Date("2028-02-28T16:00:00Z"))).toEqual([
      { variant: "birthday", count: 4, label: "Birthday" },
    ]);
  });

  it.each(["Memorial", "Archived"] as const)(
    "excludes %s pets",
    (lifecycleStatus) => {
      expect(
        derivePetOccasions(
          { ...activePet, lifecycleStatus },
          new Date("2026-08-16T16:00:00Z")
        )
      ).toEqual([]);
    }
  );
});
