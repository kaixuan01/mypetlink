// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultOwnerSettings,
  hasUsableOwnerContact,
  OWNER_SETTINGS_STORAGE_KEY,
  readOwnerSettings,
  sampleOwnerSettings,
} from "@/lib/ownerSettings";

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("owner settings fallbacks", () => {
  it("has no personal data in the production defaults", () => {
    expect(defaultOwnerSettings.ownerDisplayName).toBe("");
    expect(defaultOwnerSettings.email).toBe("");
    expect(defaultOwnerSettings.phoneNumber).toBe("");
    expect(defaultOwnerSettings.whatsappNumber).toBe("");
    expect(defaultOwnerSettings.defaultGeneralArea).toBe("");
  });

  it("returns empty defaults when the API is configured and nothing is stored", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");

    const settings = readOwnerSettings();

    expect(settings.ownerDisplayName).toBe("");
    expect(settings.phoneNumber).toBe("");
    expect(JSON.stringify(settings)).not.toContain("Aina");
  });

  it("returns the demo sample only in explicit mock mode (no API configured)", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    expect(readOwnerSettings()).toEqual(sampleOwnerSettings);
  });

  it("never falls back to the sample after a stored-value parse failure in API mode", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    window.localStorage.setItem(OWNER_SETTINGS_STORAGE_KEY, "{corrupted");

    expect(readOwnerSettings().ownerDisplayName).toBe("");
  });

  it("prefers stored values over any fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ownerDisplayName: "Real Owner", phoneNumber: "+60111222333" })
    );

    const settings = readOwnerSettings();
    expect(settings.ownerDisplayName).toBe("Real Owner");
    expect(settings.phoneNumber).toBe("+60111222333");
  });

  it("treats empty defaults as missing contact for the Home reminder", () => {
    expect(hasUsableOwnerContact(defaultOwnerSettings)).toBe(false);
    expect(hasUsableOwnerContact(sampleOwnerSettings)).toBe(true);
  });
});
