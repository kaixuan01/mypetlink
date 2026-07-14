import { describe, expect, it } from "vitest";
import { PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import {
  genderQuickPicks,
  getBioTemplates,
  getPetSuggestions,
  MAX_PERSONALITY_TAGS,
} from "@/lib/petSuggestions";

describe("getPetSuggestions", () => {
  it("returns non-empty personality, food, and toy suggestions for every supported pet type", () => {
    for (const species of PET_TYPE_OPTIONS) {
      const suggestions = getPetSuggestions(species);

      expect(suggestions.personality.length, species).toBeGreaterThan(0);
      expect(suggestions.foods.length, species).toBeGreaterThan(0);
      expect(suggestions.toys.length, species).toBeGreaterThan(0);
    }
  });

  it("gives species-specific personality suggestions for cats and dogs", () => {
    expect(getPetSuggestions("Dog").personality).toContain("Brave");
    expect(getPetSuggestions("Cat").personality).toContain("Cuddly");
    expect(getPetSuggestions("Dog").personality).not.toEqual(
      getPetSuggestions("Cat").personality
    );
  });

  it("falls back to friendly generic suggestions for Other", () => {
    const other = getPetSuggestions("Other");

    expect(other.personality).toContain("Friendly");
    expect(other.breeds).toEqual([]);
  });

  it("has no duplicate suggestions within any list", () => {
    for (const species of PET_TYPE_OPTIONS) {
      const suggestions = getPetSuggestions(species);

      for (const list of [
        suggestions.personality,
        suggestions.foods,
        suggestions.toys,
        suggestions.breeds,
      ]) {
        const keys = list.map((item) => item.trim().toLowerCase());
        expect(new Set(keys).size, `${species}: ${list.join(",")}`).toBe(
          list.length
        );
      }
    }
  });

  it("keeps breed autocomplete lists for common companion species", () => {
    expect(getPetSuggestions("Dog").breeds).toContain("Mixed breed");
    expect(getPetSuggestions("Cat").breeds).toContain("Domestic Shorthair");
  });
});

describe("bio templates and quick picks", () => {
  it("personalizes bio templates with the pet name", () => {
    const templates = getBioTemplates("Topu");

    expect(templates.length).toBeGreaterThan(1);
    for (const template of templates) {
      expect(template).toContain("Topu");
    }
  });

  it("uses a friendly fallback when the name is empty", () => {
    expect(getBioTemplates("  ")[0]).toContain("My pet");
  });

  it("offers the three expected gender quick picks", () => {
    expect([...genderQuickPicks]).toEqual(["Male", "Female", "Unknown"]);
  });

  it("limits personality selections to about five", () => {
    expect(MAX_PERSONALITY_TAGS).toBe(5);
  });
});
