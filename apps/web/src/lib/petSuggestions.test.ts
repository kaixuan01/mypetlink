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
      ]) {
        const keys = list.map((item) => item.trim().toLowerCase());
        expect(new Set(keys).size, `${species}: ${list.join(",")}`).toBe(
          list.length
        );
      }

      // Breeds come from the registry, which has its own data-quality suite.
      const breedKeys = suggestions.breeds.map((entry) =>
        entry.value.trim().toLowerCase()
      );
      expect(new Set(breedKeys).size, species).toBe(breedKeys.length);
    }
  });

  it("keeps breed suggestion lists for common companion species", () => {
    const dogBreeds = getPetSuggestions("Dog").breeds.map((entry) => entry.value);
    const catBreeds = getPetSuggestions("Cat").breeds.map((entry) => entry.value);

    expect(dogBreeds).toContain("Golden Retriever");
    expect(dogBreeds).toContain("Kampung dog");
    expect(catBreeds).toContain("Domestic Shorthair");
    expect(catBreeds).toContain("Kucing kampung");
  });

  it("serves the newly supported small rodents", () => {
    for (const species of ["Rat", "Mouse", "Gerbil"] as const) {
      const suggestions = getPetSuggestions(species);

      expect(suggestions.personality.length, species).toBeGreaterThan(0);
      expect(suggestions.foods.length, species).toBeGreaterThan(0);
      expect(suggestions.toys.length, species).toBeGreaterThan(0);
      // No reliable breed data exists for these, and none is invented.
      expect(suggestions.breeds, species).toEqual([]);
    }
  });

  it("falls back to an empty breed list rather than another species' breeds", () => {
    expect(getPetSuggestions("Ferret").breeds).toEqual([]);
    expect(getPetSuggestions("Other").breeds).toEqual([]);
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
