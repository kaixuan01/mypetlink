import { describe, expect, it } from "vitest";
import {
  describeMomentSubjects,
  formatMomentSubjects,
  resolveMomentSubjects,
  momentAdditionalPetOptions,
  momentPrimaryPetOptions,
} from "@/lib/momentSubjects";

const pets = [
  { id: "p1", name: "Mochi" },
  { id: "p2", name: "Coco" },
  { id: "p3", name: "Lucky" },
];

describe("resolveMomentSubjects", () => {
  it("puts the primary pet first", () => {
    const subjects = resolveMomentSubjects("p2", ["p1", "p3"], pets);

    expect(subjects.map((pet) => pet.name)).toEqual(["Coco", "Mochi", "Lucky"]);
  });

  it("returns only the primary pet when there are no extras", () => {
    expect(resolveMomentSubjects("p1", [], pets).map((pet) => pet.name)).toEqual([
      "Mochi",
    ]);
    expect(
      resolveMomentSubjects("p1", undefined, pets).map((pet) => pet.name)
    ).toEqual(["Mochi"]);
  });

  it("never lists the primary pet twice even if it appears as an extra", () => {
    const subjects = resolveMomentSubjects("p1", ["p1", "p2"], pets);

    expect(subjects.map((pet) => pet.id)).toEqual(["p1", "p2"]);
  });

  it("drops ids that no longer resolve to a pet", () => {
    // A deleted pet should disappear from the line, not render as a blank.
    const subjects = resolveMomentSubjects("p1", ["p2", "gone"], pets);

    expect(subjects.map((pet) => pet.name)).toEqual(["Mochi", "Coco"]);
  });

  it("returns nothing when even the primary pet is unknown", () => {
    expect(resolveMomentSubjects("gone", [], pets)).toEqual([]);
  });
});

describe("formatMomentSubjects", () => {
  it.each([
    [["Mochi"], "Mochi"],
    [["Mochi", "Coco"], "Mochi & Coco"],
    [["Mochi", "Coco", "Lucky"], "Mochi, Coco & Lucky"],
  ])("formats %j as %s", (names, expected) => {
    expect(formatMomentSubjects(names)).toBe(expected);
  });

  it("collapses a long list rather than overflowing a card", () => {
    // MaxPets is small today, but that is a product decision rather than a law.
    expect(
      formatMomentSubjects(["Mochi", "Coco", "Lucky", "Bailey", "Mimi"])
    ).toBe("Mochi, Coco, Lucky & 2 more");
  });

  it("handles an empty list", () => {
    expect(formatMomentSubjects([])).toBe("");
  });

  it("ignores blank names", () => {
    expect(formatMomentSubjects(["Mochi", "  ", "Coco"])).toBe("Mochi & Coco");
  });
});

describe("describeMomentSubjects", () => {
  it("names every pet for a screen reader, without the overflow form", () => {
    // A stack of avatars is otherwise announced as nothing useful, so the label
    // spells the list out in full rather than saying "& 2 more".
    expect(
      describeMomentSubjects(["Mochi", "Coco", "Lucky", "Bailey", "Mimi"])
    ).toBe("In this Moment: Mochi, Coco, Lucky, Bailey & Mimi");
  });

  it("is empty when there is nothing to describe", () => {
    expect(describeMomentSubjects([])).toBe("");
  });
});

describe("which pets a Moment can be about", () => {
  const pets = [
    { id: "topu", lifecycleStatus: "Active" },
    { id: "biscuit", lifecycleStatus: "Memorial" },
    { id: "pebble", lifecycleStatus: "Archived" },
    { id: "linko" },
  ];

  it("offers every own pet the server will start a Moment for", () => {
    expect(momentPrimaryPetOptions(pets).map((pet) => pet.id)).toEqual([
      "topu",
      "biscuit",
      "linko",
    ]);
  });

  it("offers the other own pets as extras, never the primary or an archived one", () => {
    expect(momentAdditionalPetOptions(pets, "topu").map((pet) => pet.id)).toEqual([
      "biscuit",
      "linko",
    ]);
  });

  it("keeps an archived pet that is already in the Moment, so it can be seen and removed", () => {
    expect(
      momentAdditionalPetOptions(pets, "topu", ["pebble"]).map((pet) => pet.id)
    ).toEqual(["biscuit", "pebble", "linko"]);
  });
});
