// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendPetDetail } from "@/services/apiDtos";
import {
  buildBackendPetPayload,
  getPets,
  mapBackendPetToFrontend,
  toPublicProfile,
  toFavoriteList,
} from "@/services/petService";

function backendPet(
  overrides: Partial<BackendPetDetail> = {}
): BackendPetDetail {
  return {
    id: "pet-1",
    name: "Topu",
    species: "Cat",
    profileTheme: "default",
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    showMemorialOnPublicProfile: true,
    publicCode: "public-code",
    publicSlug: "topu-public-code",
    safetyCode: "safety-code",
    publicProfilePath: "/p/topu-public-code",
    qrSafetyPath: "/q/safety-code",
    contact: { useOwnerDefaults: true },
    visibility: {
      showOwnerName: true,
      showGeneralArea: true,
      showPhone: true,
      showWhatsapp: true,
      showEmergencyNote: true,
      showCareBadges: true,
      showMoments: true,
      showTimeline: true,
      showBirthdayOnTimeline: true,
      showAdoptionDayOnTimeline: true,
      showHealthSummary: false,
    },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("pet favourite list API mapping", () => {
  it("maps allergies through request, clear, and response flows", () => {
    expect(
      buildBackendPetPayload({ allergies: ["Chicken", "Penicillin 💊"] })
    ).toHaveProperty("allergies", ["Chicken", "Penicillin 💊"]);
    expect(buildBackendPetPayload({ allergies: [] })).toHaveProperty(
      "allergies",
      []
    );
    expect(buildBackendPetPayload({ lostModeEnabled: true })).not.toHaveProperty(
      "allergies"
    );

    const pet = mapBackendPetToFrontend(
      backendPet({ allergies: ["Chicken", "花粉"] })
    );
    expect(pet.allergies).toEqual(["Chicken", "花粉"]);
  });

  it("removes allergies from the local public projection unless health details are enabled", () => {
    const pet = mapBackendPetToFrontend(
      backendPet({ allergies: ["Chicken", "Penicillin"] })
    );

    expect(toPublicProfile(pet).allergies).toEqual([]);
    expect(
      toPublicProfile({
        ...pet,
        visibility: { ...pet.visibility, showHealthSummary: true },
      }).allergies
    ).toEqual(["Chicken", "Penicillin"]);
  });

  it("includes saved multilingual values in the backend request payload", () => {
    const payload = buildBackendPetPayload({
      name: "Topu",
      favoriteFoods: ["参巴 ikan 🐟", "Ayam"],
      favoriteToys: ["Bola kegemaran 🎾"],
    });

    expect(payload).toMatchObject({
      favoriteFoods: ["参巴 ikan 🐟", "Ayam"],
      favoriteToys: ["Bola kegemaran 🎾"],
    });
  });

  it("preserves empty lists as explicit clear operations", () => {
    const payload = buildBackendPetPayload({
      favoriteFoods: [],
      favoriteToys: [],
    });

    expect(payload).toHaveProperty("favoriteFoods", []);
    expect(payload).toHaveProperty("favoriteToys", []);
  });

  it("does not add favourite fields to an unrelated partial update", () => {
    const payload = buildBackendPetPayload({ lostModeEnabled: true });

    expect(payload).not.toHaveProperty("favoriteFoods");
    expect(payload).not.toHaveProperty("favoriteToys");
  });

  it("maps API list responses back into the owner model", () => {
    const pet = mapBackendPetToFrontend(
      backendPet({
        favoriteFoods: ["Ayam kukus 🍗", "Tuna"],
        favoriteToys: ["毛绒老鼠 🐭"],
      })
    );

    expect(pet.favoriteFoods).toEqual(["Ayam kukus 🍗", "Tuna"]);
    expect(pet.favoriteToys).toEqual(["毛绒老鼠 🐭"]);
  });

  it("wraps legacy single-value API responses as one-item lists", () => {
    const pet = mapBackendPetToFrontend(
      backendPet({
        favoriteFood: "Ayam kukus 🍗",
        favoriteToy: "毛绒老鼠 🐭",
      })
    );

    expect(pet.favoriteFoods).toEqual(["Ayam kukus 🍗"]);
    expect(pet.favoriteToys).toEqual(["毛绒老鼠 🐭"]);
  });

  it("normalizes legacy values through toFavoriteList", () => {
    expect(toFavoriteList(undefined, "  Tuna  ")).toEqual(["Tuna"]);
    expect(toFavoriteList(undefined, "Not set")).toEqual([]);
    expect(toFavoriteList(undefined, null)).toEqual([]);
    // An explicit list wins over the legacy single value.
    expect(toFavoriteList([], "Tuna")).toEqual([]);
    expect(toFavoriteList([" A ", "", "B"], null)).toEqual(["A", "B"]);
  });

  it("keeps intentional local-preview mock mode available without API configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    const response = await getPets();

    expect(response.data.some((pet) => pet.name === "Milo")).toBe(true);
  });
});
