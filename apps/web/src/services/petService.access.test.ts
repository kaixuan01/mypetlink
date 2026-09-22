// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultOwnerSettings,
  OWNER_SETTINGS_STORAGE_KEY,
  writeOwnerSettings,
} from "@/lib/ownerSettings";
import {
  conservativePetVisibility,
  newPetVisibilityDefaults,
} from "@/lib/petVisibility";
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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

  it("omits visibility from a create request that leaves defaults to the backend", () => {
    const payload = buildBackendPetPayload({
      name: "Kopi",
      species: "Cat",
    });

    expect(payload).not.toHaveProperty("visibility");
  });

  it("sends no visibility key in the Create Pet POST body", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "pet-created",
            name: "Kopi",
            species: "Cat",
            profileTheme: "default",
            lifecycleStatus: "Active",
            lostModeEnabled: false,
            showMemorialOnPublicProfile: true,
            publicCode: "public-code",
            publicSlug: "kopi-public-code",
            safetyCode: "safety-code",
            publicProfilePath: "/p/kopi-public-code",
            qrSafetyPath: "/q/safety-code",
            contact: { useOwnerDefaults: true },
            visibility: newPetVisibilityDefaults,
            createdAt: "2026-08-21T00:00:00.000Z",
            updatedAt: "2026-08-21T00:00:00.000Z",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await createPet({ name: "Kopi", species: "Cat" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).not.toHaveProperty("visibility");
  });

  it("uses product defaults for local creation and ignores stored owner privacy defaults", async () => {
    const storedPrivacyDefaults = {
      showOwnerName: true,
      showGeneralArea: false,
      showPhone: true,
      showWhatsapp: false,
      showEmergencyNote: false,
      showCareBadges: false,
      showMoments: false,
      showTimeline: false,
      showBirthdayOnTimeline: true,
      showAdoptionDayOnTimeline: true,
      showHealthSummary: true,
      showAllergiesOnPublicProfile: true,
    };
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...structuredClone(defaultOwnerSettings),
        privacyDefaults: storedPrivacyDefaults,
      })
    );

    const pet = await createTestPet();

    expect(pet.visibility).toEqual(newPetVisibilityDefaults);
    expect(pet.visibility).not.toEqual(conservativePetVisibility);
    expect(pet.visibility).not.toEqual(storedPrivacyDefaults);
  });

  it("disabling the Public Profile keeps the Safety Profile reachable", async () => {
    const pet = await createTestPet();

    await updatePet(pet.id, { publicProfileEnabled: false });

    const publicProfile = await getPublicPetProfileByPublicCode(pet.publicCode);
    const safetyPage = await getPublicPetProfileBySafetyCode(pet.safetyCode);

    expect(publicProfile.data).toBeNull();
    expect(safetyPage.data?.name).toBe("Kopi");
  });

  it("offers no Share Profile bridge when that profile is switched off", async () => {
    const pet = await createTestPet();

    // The API answers this on the server and sends an empty path when the
    // answer is no. The local path used to copy the path across regardless,
    // so the finder page offered a button to a page that refuses to render.
    await updatePet(pet.id, { publicProfileEnabled: false });
    const safetyPage = await getPublicPetProfileBySafetyCode(pet.safetyCode);

    expect(safetyPage.data?.name).toBe("Kopi");
    expect(safetyPage.data?.publicProfilePath).toBe("");
  });

  it("offers the Share Profile bridge while that profile is switched on", async () => {
    const pet = await createTestPet();

    const safetyPage = await getPublicPetProfileBySafetyCode(pet.safetyCode);

    expect(safetyPage.data?.publicProfilePath).toBe(pet.publicProfilePath);
    expect(safetyPage.data?.publicProfilePath).not.toBe("");
  });

  it("restores the Share Profile bridge when the profile is switched back on", async () => {
    const pet = await createTestPet();

    await updatePet(pet.id, { publicProfileEnabled: false });
    await updatePet(pet.id, { publicProfileEnabled: true });
    const safetyPage = await getPublicPetProfileBySafetyCode(pet.safetyCode);

    expect(safetyPage.data?.publicProfilePath).toBe(pet.publicProfilePath);
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
