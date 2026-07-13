// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendPetDetail } from "@/services/apiDtos";
import {
  buildBackendPetPayload,
  getPets,
  mapBackendPetToFrontend,
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

describe("pet favourite field API mapping", () => {
  it("includes saved multilingual values in the backend request payload", () => {
    const payload = buildBackendPetPayload({
      name: "Topu",
      favoriteFood: "参巴 ikan 🐟",
      favoriteToy: "Bola kegemaran 🎾",
    });

    expect(payload).toMatchObject({
      favoriteFood: "参巴 ikan 🐟",
      favoriteToy: "Bola kegemaran 🎾",
    });
  });

  it("preserves empty strings as explicit clear operations", () => {
    const payload = buildBackendPetPayload({
      favoriteFood: "",
      favoriteToy: "",
    });

    expect(payload).toHaveProperty("favoriteFood", "");
    expect(payload).toHaveProperty("favoriteToy", "");
  });

  it("does not add favourite fields to an unrelated partial update", () => {
    const payload = buildBackendPetPayload({ lostModeEnabled: true });

    expect(payload).not.toHaveProperty("favoriteFood");
    expect(payload).not.toHaveProperty("favoriteToy");
  });

  it("maps API response values back into the owner form model", () => {
    const pet = mapBackendPetToFrontend(
      backendPet({
        favoriteFood: "Ayam kukus 🍗",
        favoriteToy: "毛绒老鼠 🐭",
      })
    );

    expect(pet.favoriteFood).toBe("Ayam kukus 🍗");
    expect(pet.favoriteToy).toBe("毛绒老鼠 🐭");
  });

  it("keeps intentional local-preview mock mode available without API configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    const response = await getPets();

    expect(response.data.some((pet) => pet.name === "Milo")).toBe(true);
  });
});
