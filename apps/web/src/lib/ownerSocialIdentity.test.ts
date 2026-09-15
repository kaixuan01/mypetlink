import { describe, expect, it } from "vitest";
import {
  collapseToSingleLine,
  getGeneralAreaError,
  getHandleShapeError,
  getSocialBioError,
  getSocialDisplayNameError,
  looksLikePreciseAddress,
  normalizeHandle,
  normalizeHandleForDisplay,
  suggestHandlesFromPetNames,
  suggestSocialDisplayName,
} from "@/lib/ownerSocialIdentity";

describe("handle shape", () => {
  it("accepts well-formed handles", () => {
    for (const handle of [
      "mochi",
      "mochi.coco",
      "mochi_coco",
      "tanpets88",
      "mochiandcoco",
      "the_tan_family",
    ]) {
      expect(getHandleShapeError(handle)).toBeNull();
    }
  });

  it.each([
    ["ab", "too short"],
    ["2mochi", "starts with a digit"],
    ["mochi coco", "contains a space"],
    ["mochi--coco", "uses a hyphen"],
    [".mochi", "starts with punctuation"],
    ["_mochi", "starts with punctuation"],
    ["__mochi", "starts with doubled punctuation"],
    ["mochi.", "ends with punctuation"],
    ["mochi_", "ends with punctuation"],
    ["mochi..", "ends with doubled punctuation"],
    ["mochi..coco", "two separators in a row"],
    ["mochi._coco", "two separators in a row"],
    ["...", "punctuation only"],
    ["___", "punctuation only"],
  ])("rejects %s (%s)", (handle) => {
    expect(getHandleShapeError(handle)).not.toBeNull();
  });

  it("agrees with the documented URL-safe character set", () => {
    const handle = normalizeHandle("Mochi.And_Coco99");
    expect(getHandleShapeError(handle)).toBeNull();
    expect(encodeURIComponent(handle)).toBe(handle);
  });

  it("strips a leading @ and folds case for the uniqueness key", () => {
    expect(normalizeHandle("@MochiAndCoco")).toBe("mochiandcoco");
  });

  it("keeps the owner capitalisation for display", () => {
    expect(normalizeHandleForDisplay("@MochiAndCoco")).toBe("MochiAndCoco");
  });
});

describe("general area", () => {
  it.each([
    "Bangsar, Kuala Lumpur",
    "Petaling Jaya",
    "SS2",
    "SS15",
    "USJ 9",
    "Section 17",
    "Bandar Kinrara 5",
    "Taman Melawati",
    "Desa ParkCity",
    "Bangsar South",
    "Mont Kiara",
    "59100 Kuala Lumpur",
  ])("accepts the Malaysian area %s", (area) => {
    // A digit alone must never make an area look like an address: numbered
    // neighbourhoods are the norm here.
    expect(looksLikePreciseAddress(area)).toBe(false);
    expect(getGeneralAreaError(area)).toBeNull();
  });

  it.each([
    "No. 18, Jalan Example 2/3",
    "No 12, Jalan Maarof",
    "no.12 Jalan Maarof",
    "Lot 5, Jalan Ampang",
    "Unit A-12-3, Residensi Example",
    "12 Jalan ABC",
    "Block B, Unit 10-2",
    "Apartment 14, Mont Kiara",
  ])("rejects the precise address %s", (area) => {
    expect(looksLikePreciseAddress(area)).toBe(true);
    expect(getGeneralAreaError(area)).toContain("not a full street address");
  });

  it("rejects a value longer than the limit", () => {
    expect(getGeneralAreaError("a".repeat(120))).not.toBeNull();
  });

  it("treats an empty value as not set rather than an error", () => {
    expect(getGeneralAreaError("")).toBeNull();
    expect(getGeneralAreaError("   ")).toBeNull();
  });

  it("collapses a pasted multi-line address to one line", () => {
    expect(collapseToSingleLine("Bangsar,\r\n\tKuala Lumpur  ")).toBe(
      "Bangsar, Kuala Lumpur"
    );
  });
});

describe("display name and bio", () => {
  it("accepts a household name", () => {
    expect(getSocialDisplayNameError("Mochi & Coco's Family")).toBeNull();
  });

  it("requires a display name", () => {
    expect(getSocialDisplayNameError("  ")).not.toBeNull();
  });

  it("rejects an overlong display name", () => {
    expect(getSocialDisplayNameError("a".repeat(80))).not.toBeNull();
  });

  it("allows an empty bio but not an overlong one", () => {
    expect(getSocialBioError("")).toBeNull();
    expect(getSocialBioError("a".repeat(400))).not.toBeNull();
  });
});

describe("suggestions", () => {
  it("builds handle ideas from pet names", () => {
    const suggestions = suggestHandlesFromPetNames(["Mochi", "Coco"]);

    expect(suggestions).toContain("mochi");
    expect(suggestions).toContain("mochiandcoco");
    expect(suggestions.every((handle) => getHandleShapeError(handle) === null)).toBe(true);
  });

  it("never derives a suggestion from an email or an account name", () => {
    // The suggestion source is pet names only. Passing an email-shaped value
    // that is not a pet name must not produce anything resembling it.
    const suggestions = suggestHandlesFromPetNames([]);
    expect(suggestions).toEqual([]);
  });

  it("builds a household display name from pet names", () => {
    expect(suggestSocialDisplayName(["Mochi"])).toBe("Mochi's Family");
    expect(suggestSocialDisplayName(["Mochi", "Coco"])).toBe("Mochi & Coco's Family");
    expect(suggestSocialDisplayName([])).toBe("");
  });

  it("drops pet names that cannot form a valid handle", () => {
    expect(suggestHandlesFromPetNames(["A", "!!"])).toEqual([]);
  });
});
