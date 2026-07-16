// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
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
  getPublicPetProfileByPublicCode,
  getPublicPetProfileBySafetyCode,
  mapBackendPublicProfile,
  mapBackendSafetyPage,
} from "@/services/petService";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("bypasses browser caches when loading a dynamic public profile", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(JSON.stringify({ data: publicProfile("mint") }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    await getPublicPetProfileByPublicCode("public-code");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("maps the public profile safety identifier to the canonical QR route", () => {
    const mapped = mapBackendPublicProfile({
      ...publicProfile("mint"),
      safetyCode: "safety-qr-123",
    });

    expect(mapped.safetyCode).toBe("safety-qr-123");
    expect(mapped.qrSafetyPath).toBe("/q/safety-qr-123");
    expect(mapped.qrSafetyPath).not.toContain(mapped.slug);

    const withoutSafetyPage = mapBackendPublicProfile(publicProfile("mint"));
    expect(withoutSafetyPage.qrSafetyEnabled).toBe(false);
    expect(withoutSafetyPage.qrSafetyPath).toBe("");
  });

  it("keeps QR allergies independent from regular Public Profile visibility", () => {
    const mapped = mapBackendSafetyPage({
      ...safetyProfile("mint"),
      allergies: ["Chicken", "Penicillin"],
    });

    expect(mapped.visibility.showAllergiesOnPublicProfile).toBe(false);
    expect(mapped.allergies).toEqual(["Chicken", "Penicillin"]);
  });

  it("bypasses browser caches when refreshing the QR Safety Page", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(JSON.stringify({ data: safetyProfile("mint") }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    await getPublicPetProfileBySafetyCode("safety-code");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
});
