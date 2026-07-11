import { describe, expect, it } from "vitest";
import {
  applyPetAgeMode,
  calculatePetAge,
  getPetAgeMode,
} from "./petAge";

const referenceDate = new Date("2026-07-11T00:00:00.000Z");

describe("calculatePetAge", () => {
  it("prioritizes an exact birthday over an estimated year", () => {
    const result = calculatePetAge(
      { birthday: "01 Jan 2020", estimatedBirthYear: 2022 },
      referenceDate
    );

    expect(result).toEqual({
      source: "ExactBirthday",
      ageInYears: 6,
      displayLabel: "6 years old",
    });
  });

  it("calculates exact age according to whether the birthday has occurred", () => {
    expect(
      calculatePetAge({ birthday: "01 Dec 2020" }, referenceDate).ageInYears
    ).toBe(5);
    expect(
      calculatePetAge({ birthday: "01 Feb 2020" }, referenceDate).ageInYears
    ).toBe(6);
  });

  it("returns an approximate age from the estimated birth year", () => {
    expect(
      calculatePetAge({ estimatedBirthYear: 2022 }, referenceDate)
    ).toMatchObject({
      source: "EstimatedBirthYear",
      ageInYears: 4,
      displayLabel: "About 4 years old",
    });
  });

  it("updates estimated age when the reference year changes", () => {
    const pet = { estimatedBirthYear: 2022 };

    expect(calculatePetAge(pet, referenceDate).displayLabel).toBe(
      "About 4 years old"
    );
    expect(
      calculatePetAge(pet, new Date("2027-07-11T00:00:00.000Z")).displayLabel
    ).toBe("About 5 years old");
  });

  it("uses under-one and unknown labels only in their valid states", () => {
    expect(
      calculatePetAge({ estimatedBirthYear: 2026 }, referenceDate).displayLabel
    ).toBe("Under 1 year old");
    expect(calculatePetAge({}, referenceDate).displayLabel).toBe("Age unknown");
  });
});

describe("age information form state", () => {
  it("loads birthday plus a legacy unknown label as exact birthday mode", () => {
    expect(
      getPetAgeMode({ birthday: "12 Oct 2023", estimatedBirthYear: null })
    ).toBe("ExactBirthday");
  });

  it("loads estimated year and empty values into their matching modes", () => {
    expect(getPetAgeMode({ birthday: "Not set", estimatedBirthYear: 2022 })).toBe(
      "EstimatedBirthYear"
    );
    expect(getPetAgeMode({ birthday: "Not set" })).toBe("Unknown");
  });

  it("clears the conflicting value whenever the selected mode changes", () => {
    const values = { birthdayDate: "2020-01-01", estimatedBirthYear: "2022" };

    expect(applyPetAgeMode("ExactBirthday", values)).toEqual({
      birthdayDate: "2020-01-01",
      estimatedBirthYear: "",
    });
    expect(applyPetAgeMode("EstimatedBirthYear", values)).toEqual({
      birthdayDate: "",
      estimatedBirthYear: "2022",
    });
    expect(applyPetAgeMode("Unknown", values)).toEqual({
      birthdayDate: "",
      estimatedBirthYear: "",
    });
  });
});
