// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultOwnerSettings,
  writeOwnerSettings,
} from "@/lib/ownerSettings";
import {
  buildBackendPetPayload,
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

  it("keeps cleared owner contact channels independent in new pet defaults", async () => {
    writeOwnerSettings({
      ...structuredClone(defaultOwnerSettings),
      ownerDisplayName: "Owner",
      phoneNumber: "",
      whatsappNumber: "+60128889999",
    });

    const pet = await createTestPet();

    expect(pet.owner.phone).toBe("");
    expect(pet.owner.whatsapp).toBe("+60128889999");
  });

  it("does not copy owner contact values into an owner-default API payload", () => {
    const payload = buildBackendPetPayload({
      name: "Kopi",
      species: "Cat",
      owner: {
        name: "Owner",
        phone: "+60123334444",
        whatsapp: "+60128889999",
        emergencyContact: "+60123334444",
      },
      contactOverride: { useOwnerDefaults: true },
    });

    expect(payload.contact).toEqual({
      useOwnerDefaults: true,
      ownerDisplayName: null,
      phoneE164: null,
      whatsappE164: null,
      emergencyContactE164: null,
      generalAreaOverride: null,
    });
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
