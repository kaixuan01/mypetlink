// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultOwnerSettings,
  forgetOwnerSettingsOfOtherSessions,
  getEffectivePetContact,
  hasUsableOwnerContact,
  OWNER_SETTINGS_STORAGE_KEY,
  readOwnerSettings,
  sampleOwnerSettings,
  writeOwnerSettings,
} from "@/lib/ownerSettings";
import { getAuthSessionKey, updateStoredAuthTokens } from "@/services/authStorage";
import { installHeldFetch, SESSION_STORAGE_KEY, storedSession } from "@/services/sessionTestFetch";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Signs in as the browser stores a sign-in and returns its session key. */
function signIn(userId: string, sessionId?: string) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, storedSession(userId, { sessionId }));
  return getAuthSessionKey();
}

/** Owner details as the cache holds them, with an explicit ownership stamp (or none). */
function seedCache(details: Record<string, unknown>, stamp?: unknown) {
  window.localStorage.setItem(
    OWNER_SETTINGS_STORAGE_KEY,
    JSON.stringify(stamp === undefined ? details : { ...details, sessionKey: stamp })
  );
}

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

  it("prefers stored values over any fallback for the signed-in owner they belong to", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const key = signIn("owner-real", "real");
    seedCache({ ownerDisplayName: "Real Owner", phoneNumber: "+60111222333" }, key);

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
    const key = signIn("owner-legacy", "legacy");
    seedCache(
      {
        ownerDisplayName: "Legacy Owner",
        phoneNumber: "+60111222333",
        privacyDefaults: { showPhone: true },
        privacy: { ownerName: true, moments: false },
      },
      key
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
    expect(stored.sessionKey).toBe(key);
  });

  it("keeps missing and legacy marketing consent opted out", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const key = signIn("owner-consent", "consent");
    seedCache(
      {
        ownerDisplayName: "Legacy Owner",
        notifications: {
          whatsappReminders: true,
          emailReminders: true,
          careDigest: true,
        },
      },
      key
    );

    const settings = readOwnerSettings();
    // Read as the owner's own details, so the opt-out comes from them.
    expect(settings.ownerDisplayName).toBe("Legacy Owner");
    expect(settings.marketingEmailOptIn).toBe(false);
  });
});

const PRIVATE_A = {
  ownerDisplayName: "Owner A Private",
  email: "a@example.test",
  phoneNumber: "+60111111111",
  whatsappNumber: "+60111111112",
};

/** None of A's name, email or numbers come back. */
function expectNeutral() {
  expect(readOwnerSettings()).toEqual(defaultOwnerSettings);
}
const cacheGone = () => window.localStorage.getItem(OWNER_SETTINGS_STORAGE_KEY) === null;

describe("C1: owner details are only ever the current sign-in's (API mode)", () => {
  it.each([
    ["A: a legacy cache with no stamp", undefined],
    ["B: a stamp of null", null],
    ["C: an empty stamp", ""],
    ["C: a stamp that is not a session key", 42],
    ["C: a stamp that is an object", { key: "session:x" }],
  ])("signed out, %s: reads as neutral and is removed", (_label, stamp) => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    seedCache(PRIVATE_A, stamp);

    expectNeutral();
    forgetOwnerSettingsOfOtherSessions();
    expect(cacheGone()).toBe(true);
  });

  it("signed in, an unstamped, null or empty stamp is not the owner's either", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    signIn("owner-a", "a");
    for (const stamp of [undefined, null, ""]) {
      seedCache(PRIVATE_A, stamp);
      expectNeutral();
      forgetOwnerSettingsOfOtherSessions();
      expect(cacheGone()).toBe(true);
    }
  });

  it("D: signed in as A, A's own stamped details read normally and are kept", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const key = signIn("owner-a", "a");
    seedCache(PRIVATE_A, key);

    expect(readOwnerSettings().ownerDisplayName).toBe(PRIVATE_A.ownerDisplayName);
    expect(readOwnerSettings().phoneNumber).toBe(PRIVATE_A.phoneNumber);
    forgetOwnerSettingsOfOtherSessions();
    expect(cacheGone()).toBe(false);
  });

  it("E: signed in as B, A's stamped details are never read and are removed", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const keyA = signIn("owner-a", "a");
    seedCache(PRIVATE_A, keyA);
    signIn("owner-b", "b");

    expectNeutral();
    forgetOwnerSettingsOfOtherSessions();
    expect(cacheGone()).toBe(true);
  });

  it("F: an ordinary token refresh keeps the owner's details", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    signIn("owner-a", "a");
    writeOwnerSettings({ ...defaultOwnerSettings, ...PRIVATE_A });
    updateStoredAuthTokens({ accessToken: "rotated", refreshToken: "rotated-r", expiresIn: 3600 });

    expect(readOwnerSettings().ownerDisplayName).toBe(PRIVATE_A.ownerDisplayName);
    forgetOwnerSettingsOfOtherSessions();
    expect(cacheGone()).toBe(false);
  });

  it("G: the same person signing in again does not inherit the previous sign-in's details", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    signIn("owner-a", "a-first");
    writeOwnerSettings({ ...defaultOwnerSettings, ...PRIVATE_A });
    signIn("owner-a", "a-second");

    expectNeutral();
    forgetOwnerSettingsOfOtherSessions();
    expect(cacheGone()).toBe(true);
  });

  it("H: a sign-in stored before session ids keeps its own stamped details", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const key = signIn("owner-legacy");
    expect(key).toBe("user:owner-legacy");
    writeOwnerSettings({ ...defaultOwnerSettings, ...PRIVATE_A });

    expect(readOwnerSettings().ownerDisplayName).toBe(PRIVATE_A.ownerDisplayName);
    forgetOwnerSettingsOfOtherSessions();
    expect(cacheGone()).toBe(false);
  });

  it("I: an owner-profile answer for a sign-in that has ended cannot store its details", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    const held = installHeldFetch();
    vi.stubGlobal("fetch", held.fetchImpl);
    const { getOwnerProfileSettings } = await import("@/services/ownerProfileService");
    signIn("owner-a", "a-late");
    const read = getOwnerProfileSettings().catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));

    signIn("owner-b", "b-late");
    held.requests[0].answer(200, {
      data: {
        displayName: PRIVATE_A.ownerDisplayName,
        email: PRIVATE_A.email,
        phoneE164: PRIVATE_A.phoneNumber,
        whatsappE164: PRIVATE_A.whatsappNumber,
        defaultGeneralArea: null,
        marketingEmailOptIn: false,
      },
    });
    await read;

    expectNeutral();
    expect(window.localStorage.getItem(OWNER_SETTINGS_STORAGE_KEY) ?? "").not.toContain(
      PRIVATE_A.ownerDisplayName
    );
  });

  it("J: signed out, a write cannot store private details without an owner", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    writeOwnerSettings({ ...defaultOwnerSettings, ...PRIVATE_A });

    expect(cacheGone()).toBe(true);
    expectNeutral();
  });

  it("K: the local preview keeps its own unstamped details, as before", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    seedCache(PRIVATE_A);
    expect(readOwnerSettings().ownerDisplayName).toBe(PRIVATE_A.ownerDisplayName);
    forgetOwnerSettingsOfOtherSessions();
    expect(cacheGone()).toBe(false);

    window.localStorage.clear();
    writeOwnerSettings({ ...defaultOwnerSettings, ownerDisplayName: "Preview Owner" });
    expect(readOwnerSettings().ownerDisplayName).toBe("Preview Owner");

    window.localStorage.clear();
    expect(readOwnerSettings()).toEqual(sampleOwnerSettings);
  });
});
