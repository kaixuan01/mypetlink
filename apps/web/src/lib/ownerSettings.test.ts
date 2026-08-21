// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultOwnerSettings,
  getEffectivePetContact,
  hasUsableOwnerContact,
  OWNER_SETTINGS_STORAGE_KEY,
  readOwnerSettings,
  sampleOwnerSettings,
  writeOwnerSettings,
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
    expect(defaultOwnerSettings.marketingEmailOptIn).toBe(false);
    expect(defaultOwnerSettings.notificationPreferences).toEqual({
      whatsappReminders: false,
      emailReminders: false,
      careDigest: false,
    });
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

  it("does not fabricate an owner name or location for missing pet contact", () => {
    const contact = getEffectivePetContact(
      {
        name: "Milo",
        generalArea: "",
        owner: { name: "", phone: "", whatsapp: "", emergencyContact: "" },
        contactOverride: { useOwnerDefaults: false },
      },
      {
        ...defaultOwnerSettings,
        ownerDisplayName: "Account Owner",
        defaultGeneralArea: "Account Area",
      }
    );

    expect(contact.ownerDisplayName).toBe("");
    expect(contact.generalArea).toBe("");
    expect(JSON.stringify(contact)).not.toContain("Milo's owner");
  });

  it("uses real account defaults when the pet selects them", () => {
    const contact = getEffectivePetContact(
      {
        name: "Milo",
        generalArea: "",
        owner: { name: "", phone: "", whatsapp: "", emergencyContact: "" },
        contactOverride: { useOwnerDefaults: true },
      },
      {
        ...defaultOwnerSettings,
        ownerDisplayName: "Account Owner",
        defaultGeneralArea: "Petaling Jaya",
      }
    );

    expect(contact.ownerDisplayName).toBe("Account Owner");
    expect(contact.generalArea).toBe("Petaling Jaya");
  });

  it("ignores stale privacy defaults and legacy privacy data on read and write", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ownerDisplayName: "Legacy Owner",
        phoneNumber: "+60111222333",
        privacyDefaults: { showPhone: true },
        privacy: { ownerName: true, moments: false },
      })
    );

    const settings = readOwnerSettings();
    expect(settings.ownerDisplayName).toBe("Legacy Owner");
    expect(settings.phoneNumber).toBe("+60111222333");
    expect(settings).not.toHaveProperty("privacyDefaults");
    expect(settings).not.toHaveProperty("privacy");

    writeOwnerSettings(settings);
    const stored = JSON.parse(
      window.localStorage.getItem(OWNER_SETTINGS_STORAGE_KEY) ?? "{}"
    );
    expect(stored).not.toHaveProperty("privacyDefaults");
    expect(stored).not.toHaveProperty("privacy");
  });

  it("keeps missing and legacy marketing consent opted out", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ownerDisplayName: "Legacy Owner",
        notifications: {
          whatsappReminders: true,
          emailReminders: true,
          careDigest: true,
        },
      })
    );

    expect(readOwnerSettings().marketingEmailOptIn).toBe(false);
  });
});
