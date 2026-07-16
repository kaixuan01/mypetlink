// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendPetDetail } from "@/services/apiDtos";
import { updatePetLostMode } from "@/services/petService";

function backendPet(
  overrides: Partial<BackendPetDetail> = {}
): BackendPetDetail {
  return {
    id: "8f2677ec-e14e-4f1c-90d6-7e82c617ec77",
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
    updatedAt: "2026-07-16T01:30:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Lost Mode API service", () => {
  it.each([true, false])(
    "uses the dedicated endpoint and returns confirmed state %s",
    async (enabled) => {
      vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body));
          return new Response(
            JSON.stringify({
              data: backendPet({
                lostModeEnabled: body.enabled,
                lostLastSeenArea: body.lastSeenArea,
                lostLastSeenDateTime: body.lastSeenDateTime,
                lostMessage: body.lostMessage,
                lostRewardNote: body.rewardNote,
                lostExtraContactInstruction: body.extraContactInstruction,
              }),
            }),
            { headers: { "Content-Type": "application/json" }, status: 200 }
          );
        }
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await updatePetLostMode(
        "8f2677ec-e14e-4f1c-90d6-7e82c617ec77",
        enabled,
        {
          lastSeenArea: " Petaling Jaya ",
          lastSeenDateTime: "2026-07-16T09:30",
          lostMessage: " Please call the owner. ",
          rewardNote: " Reward offered ",
          extraContactInstruction: " WhatsApp first ",
        }
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, request] = fetchMock.mock.calls[0];
      const body = JSON.parse(String(request?.body));
      expect(String(url)).toBe(
        "https://api.mypetlink.test/api/v1/pets/8f2677ec-e14e-4f1c-90d6-7e82c617ec77/lost-mode"
      );
      expect(request?.method).toBe("POST");
      expect(body).toMatchObject({
        enabled,
        lastSeenArea: "Petaling Jaya",
        lostMessage: "Please call the owner.",
        rewardNote: "Reward offered",
        extraContactInstruction: "WhatsApp first",
      });
      expect(body.lastSeenDateTime).toMatch(/Z$/);
      expect(response.data?.lostModeEnabled).toBe(enabled);
      expect(response.data?.lostMode.lastSeenDateTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
      );
    }
  );
});
