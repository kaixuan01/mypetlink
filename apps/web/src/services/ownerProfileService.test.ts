// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultOwnerSettings,
  readOwnerSettings,
  writeOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import type { BackendOwnerProfile } from "@/services/apiDtos";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/services/apiClient", () => ({
  apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
}));

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => true,
  isApiConfigured: () => true,
}));

vi.mock("@/lib/planLimits", () => ({
  adoptServerPlanLimits: vi.fn(),
  freePlanLimits: {
    planName: "Free",
    maxPets: 3,
    maxMemoriesPerPet: 10,
  },
  getEffectivePlanLimits: () => ({
    planName: "Free",
    maxPets: 3,
    maxMemoriesPerPet: 10,
  }),
}));

const { getOwnerProfileSettings, updateOwnerProfileSettings } = await import(
  "@/services/ownerProfileService"
);

function settings(overrides: Partial<OwnerSettings> = {}): OwnerSettings {
  return {
    ...structuredClone(defaultOwnerSettings),
    ownerDisplayName: "Owner",
    email: "owner@example.com",
    defaultGeneralArea: "Petaling Jaya",
    ...overrides,
  };
}

function profile(
  phoneE164: string | null,
  whatsappE164: string | null
): BackendOwnerProfile {
  return {
    userId: "11111111-1111-1111-1111-111111111111",
    ownerProfileId: "22222222-2222-2222-2222-222222222222",
    displayName: "Owner",
    email: "owner@example.com",
    phoneE164,
    whatsappE164,
    defaultGeneralArea: "Petaling Jaya",
    defaultContact: {
      displayName: "Owner",
      phoneE164,
      whatsappE164,
      defaultGeneralArea: "Petaling Jaya",
    },
    defaultPrivacy: structuredClone(defaultOwnerSettings.privacyDefaults),
    notificationPreferences: structuredClone(
      defaultOwnerSettings.notificationPreferences
    ),
    planCode: "Free",
    plan: null,
    createdAt: "2026-07-18T00:00:00Z",
    updatedAt: "2026-07-18T00:00:00Z",
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.apiRequest.mockReset();
});

describe("owner contact persistence", () => {
  it.each([
    {
      name: "WhatsApp only",
      phone: "+60123334444",
      whatsapp: "",
      expectedPhone: "+60123334444",
      expectedWhatsapp: null,
    },
    {
      name: "phone only",
      phone: "",
      whatsapp: "+60128889999",
      expectedPhone: null,
      expectedWhatsapp: "+60128889999",
    },
    {
      name: "both numbers",
      phone: "",
      whatsapp: "",
      expectedPhone: null,
      expectedWhatsapp: null,
    },
    {
      name: "whitespace-only numbers",
      phone: "   ",
      whatsapp: "\t",
      expectedPhone: null,
      expectedWhatsapp: null,
    },
  ])("clears $name without changing the other contact", async (testCase) => {
    mocks.apiRequest.mockResolvedValue({
      data: profile(testCase.expectedPhone, testCase.expectedWhatsapp),
      meta: { requestId: "request-1" },
    });

    const response = await updateOwnerProfileSettings(
      settings({
        phoneNumber: testCase.phone,
        whatsappNumber: testCase.whatsapp,
      })
    );

    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/owner/profile", {
      method: "PUT",
      body: expect.objectContaining({
        phoneE164: testCase.expectedPhone,
        whatsappE164: testCase.expectedWhatsapp,
      }),
    });
    expect(response.data.phoneNumber).toBe(testCase.expectedPhone ?? "");
    expect(response.data.whatsappNumber).toBe(testCase.expectedWhatsapp ?? "");
    expect(readOwnerSettings().phoneNumber).toBe(testCase.expectedPhone ?? "");
    expect(readOwnerSettings().whatsappNumber).toBe(
      testCase.expectedWhatsapp ?? ""
    );
  });

  it("hydrates cleared server values as empty inputs after a refetch", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: profile(null, null),
      meta: { requestId: "request-2" },
    });

    const response = await getOwnerProfileSettings();

    expect(response.data.phoneNumber).toBe("");
    expect(response.data.whatsappNumber).toBe("");
    expect(readOwnerSettings().phoneNumber).toBe("");
    expect(readOwnerSettings().whatsappNumber).toBe("");
  });

  it("does not report or cache success when the server returns stale contact", async () => {
    writeOwnerSettings(
      settings({
        phoneNumber: "+60123334444",
        whatsappNumber: "+60128889999",
      })
    );
    mocks.apiRequest.mockResolvedValue({
      data: profile("+60123334444", "+60128889999"),
      meta: { requestId: "request-3" },
    });

    await expect(
      updateOwnerProfileSettings(
        settings({ phoneNumber: "+60123334444", whatsappNumber: "" })
      )
    ).rejects.toThrow(/did not match/i);

    expect(readOwnerSettings().whatsappNumber).toBe("+60128889999");
  });
});
