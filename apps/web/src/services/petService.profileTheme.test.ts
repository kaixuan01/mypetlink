import { describe, expect, it } from "vitest";
import {
  getPetProfileTheme,
  petProfileThemes,
  resolvePetProfileThemeId,
} from "@/lib/petProfileThemes";
import type {
  BackendPublicPetProfile,
  BackendPublicSafetyPage,
} from "@/services/apiDtos";
import {
  buildBackendPetPayload,
  mapBackendPublicProfile,
  mapBackendSafetyPage,
} from "@/services/petService";

function publicProfile(
  profileTheme: string
): BackendPublicPetProfile {
  return {
    publicCode: "public-code",
    publicSlug: "topu-public-code",
    name: "Topu",
    species: "Cat",
    profileTheme,
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    memories: [],
    careRecords: [],
  };
}

function safetyProfile(profileTheme: string): BackendPublicSafetyPage {
  return {
    safetyCode: "safety-code",
    state: "Active",
    name: "Topu",
    species: "Cat",
    profileTheme,
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    showFoundLocationAction: false,
  };
}

describe("pet profile theme API mapping", () => {
  it("sends the selected theme in the owner update payload", () => {
    expect(
      buildBackendPetPayload({ name: "Topu", profileTheme: "lavender" })
    ).toMatchObject({ profileTheme: "lavender" });
  });

  it("uses the saved public theme for both public profile projections", () => {
    expect(mapBackendPublicProfile(publicProfile("sky")).profileTheme).toBe(
      "sky"
    );
    expect(mapBackendSafetyPage(safetyProfile("sky")).profileTheme).toBe(
      "sky"
    );
  });

  it("falls back safely when an API returns an unknown legacy theme", () => {
    expect(mapBackendPublicProfile(publicProfile("legacy-blue")).profileTheme).toBe(
      "default"
    );
    expect(
      mapBackendSafetyPage(safetyProfile("legacy-blue")).profileTheme
    ).toBe("default");
    expect(resolvePetProfileThemeId("legacy-blue")).toBe("default");
    expect(getPetProfileTheme("legacy-blue").id).toBe("default");
  });

  it("resolves only the stable theme keys exposed by the shared registry", () => {
    expect(petProfileThemes.map((theme) => theme.id)).toEqual([
      "default",
      "mint",
      "peach",
      "sky",
      "lavender",
    ]);
  });
});
