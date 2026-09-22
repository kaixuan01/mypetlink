// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => true,
  isApiConfigured: () => true,
  getFrontendResilienceConfig: () => ({ maximumWaitMs: 1000 }),
}));

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>(
    "@/services/apiClient"
  );

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
  };
});

const { getFinderState } = await import("@/services/tagService");

/**
 * A Smart Tag is an access method, not a different profile.
 *
 * The server decides whether a finder may be offered the pet's Share Profile,
 * and every Safety Profile entry point answers it the same way. These tests
 * cover the wiring that carries that answer through a *tag* scan — the half
 * that was never exercised, because the tag payload never carried the slug and
 * so the mapping could not be wrong in a visible way.
 *
 * The rule itself is asserted server-side in
 * `PetSafetyProfileAccessTests.BridgeFromEveryEntryPointAsync`.
 */

function tagScanPayload(publicProfileSlug: string | null) {
  return {
    data: {
      state: "active",
      tagCode: "MPL-TEST-0001",
      status: "Active",
      source: "Qr",
      profile: {
        safetyCode: "safe-topu",
        state: "Active",
        name: "Topu",
        species: "Cat",
        birthday: null,
        estimatedBirthYear: null,
        age: { source: "Unknown", ageInYears: null, displayLabel: "Age unknown" },
        lifecycleStatus: "Active",
        lostModeEnabled: false,
        generalArea: null,
        safetyNote: null,
        emergencyNote: null,
        lostLastSeenArea: null,
        lostLastSeenDateTime: null,
        lostMessage: null,
        lostRewardNote: null,
        lostExtraContactInstruction: null,
        profilePhotoUrl: null,
        coverPhotoUrl: null,
        coverPositionX: 50,
        coverPositionY: 50,
        profileTheme: "default",
        allergies: [],
        showFoundLocationAction: true,
        contact: {
          ownerDisplayName: "Owner",
          phoneE164: "+60123456789",
          whatsappE164: "+60123456789",
          emergencyContactE164: null,
        },
        publicProfileSlug,
      },
    },
    meta: null,
  };
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Share Profile bridge through a Smart Tag scan", () => {
  it.each(["qr", "nfc", "legacy"] as const)(
    "carries the server's answer through a %s scan",
    async (source) => {
      mocks.apiRequest.mockResolvedValue(tagScanPayload("topu-pub123"));

      const result = await getFinderState("MPL-TEST-0001", source);

      expect(result.state).toBe("active");
      if (result.state !== "active") return;
      expect(result.profile.publicProfilePath).toBe("/p/topu-pub123");
    }
  );

  it.each(["qr", "nfc", "legacy"] as const)(
    "offers nothing through a %s scan when the server withheld it",
    async (source) => {
      mocks.apiRequest.mockResolvedValue(tagScanPayload(null));

      const result = await getFinderState("MPL-TEST-0001", source);

      expect(result.state).toBe("active");
      if (result.state !== "active") return;

      // Empty, not a path to a page that would refuse to render. The finder
      // card keys off this being falsy.
      expect(result.profile.publicProfilePath).toBe("");
    }
  );

  it("asks the endpoint that matches the access method", async () => {
    mocks.apiRequest.mockResolvedValue(tagScanPayload("topu-pub123"));

    await getFinderState("MPL-TEST-0001", "qr");
    expect(mocks.apiRequest.mock.calls[0][0]).toContain("/qr");

    await getFinderState("MPL-TEST-0001", "nfc");
    expect(mocks.apiRequest.mock.calls[1][0]).toContain("/nfc");

    await getFinderState("MPL-TEST-0001", "legacy");
    expect(mocks.apiRequest.mock.calls[2][0]).not.toMatch(/\/(qr|nfc)$/);
  });
});
