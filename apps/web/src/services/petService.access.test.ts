// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPet,
  getPublicPetProfileByPublicCode,
  getPublicPetProfileBySafetyCode,
  updatePet,
} from "@/services/petService";

// These tests run against the local storage data path (no API configured), so
// they exercise the same access rules the portal uses in local mode.
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

async function createTestPet() {
  const response = await createPet({ name: "Kopi", species: "Cat" });
  return response.data;
}

describe("Public Profile and Safety Profile access independence", () => {
  it("creates new pets with both pages enabled and no linked tag state", async () => {
    const pet = await createTestPet();

    expect(pet.qrSafetyEnabled).toBe(true);
    expect(pet.publicProfileEnabled).toBe(true);
    expect(pet.safetyCode).toBeTruthy();
    expect(pet.publicCode).toBeTruthy();
  });

  it("disabling the Public Profile keeps the Safety Profile reachable", async () => {
    const pet = await createTestPet();

    await updatePet(pet.id, { publicProfileEnabled: false });

    const publicProfile = await getPublicPetProfileByPublicCode(pet.publicCode);
    const safetyPage = await getPublicPetProfileBySafetyCode(pet.safetyCode);

    expect(publicProfile.data).toBeNull();
    expect(safetyPage.data?.name).toBe("Kopi");
  });

  it("disabling the Safety Profile keeps the Public Profile reachable", async () => {
    const pet = await createTestPet();

    await updatePet(pet.id, { qrSafetyEnabled: false });

    const publicProfile = await getPublicPetProfileByPublicCode(pet.publicCode);
    const safetyPage = await getPublicPetProfileBySafetyCode(pet.safetyCode);

    expect(publicProfile.data?.name).toBe("Kopi");
    expect(safetyPage.data).toBeNull();
  });

  it("re-enabling a page restores access without touching the other switch", async () => {
    const pet = await createTestPet();
    await updatePet(pet.id, { qrSafetyEnabled: false });

    const updated = await updatePet(pet.id, { qrSafetyEnabled: true });

    expect(updated.data?.qrSafetyEnabled).toBe(true);
    expect(updated.data?.publicProfileEnabled).toBe(true);
    const safetyPage = await getPublicPetProfileBySafetyCode(pet.safetyCode);
    expect(safetyPage.data?.name).toBe("Kopi");
  });
});
