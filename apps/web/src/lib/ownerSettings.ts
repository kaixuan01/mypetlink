import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import { isApiConfigured } from "@/services/apiConfig";
import { getAuthSessionKey, subscribeAuthSession } from "@/services/authStorage";
import type { Pet, PublicPetProfile } from "@/types";

export const OWNER_SETTINGS_STORAGE_KEY = "mypetlink_owner_settings";

export type OwnerNotificationPreferences = {
  whatsappReminders: boolean;
  emailReminders: boolean;
  careDigest: boolean;
};

export type OwnerSettings = {
  ownerDisplayName: string;
  email: string;
  whatsappNumber: string;
  phoneNumber: string;
  defaultGeneralArea: string;
  notificationPreferences: OwnerNotificationPreferences;
  marketingEmailOptIn: boolean;
};

type LegacySettings = Partial<{
  name: string;
  email: string;
  whatsapp: string;
  phone: string;
  defaultArea: string;
  notifications: Partial<OwnerNotificationPreferences>;
}>;

// Neutral defaults: notification presets only, NO personal data. This
// is the safe fallback shape everywhere — production must never show sample
// names or phone numbers as if they were the signed-in owner's saved details.
export const defaultOwnerSettings: OwnerSettings = {
  ownerDisplayName: "",
  email: "",
  whatsappNumber: "",
  phoneNumber: "",
  defaultGeneralArea: "",
  notificationPreferences: {
    whatsappReminders: false,
    emailReminders: false,
    careDigest: false,
  },
  marketingEmailOptIn: false,
};

// Demo owner used ONLY by the explicit local-preview mock mode (no API
// configured). A production API failure can never reach these values because
// readOwnerSettings checks the build-time API configuration, not request
// success.
export const sampleOwnerSettings: OwnerSettings = {
  ...defaultOwnerSettings,
  ownerDisplayName: "Aina Rahman",
  email: "aina@example.com",
  whatsappNumber: "+60123456789",
  phoneNumber: "+60123456789",
  defaultGeneralArea: "Petaling Jaya, Selangor",
};

function fallbackOwnerSettings(): OwnerSettings {
  return isApiConfigured() ? defaultOwnerSettings : sampleOwnerSettings;
}

// The cached owner details are stamped with the sign-in they were read for.
// Under any other sign-in — another account, the same person signed in again,
// or a session changed while nothing was listening — they read as empty, so
// they can never cross from one sign-in to the next. A token refresh keeps
// the sign-in, and so keeps them. The local preview has no sign-in to stamp.
//
// Ownership needs a real sign-in on both sides: with nobody signed in, or a
// missing, null, empty or malformed stamp, nobody owns the details. A public
// page read while signed out therefore never gets a cached owner's identity
// or numbers, and such details are never written in the first place.
const SESSION_STAMP = "sessionKey";

/** Whether cached details with this stamp belong to the sign-in stored now. */
function ownedByCurrentSession(stamp: unknown) {
  const current = getAuthSessionKey();
  return current !== null && typeof stamp === "string" && stamp !== "" && stamp === current;
}

export function readOwnerSettings(): OwnerSettings {
  if (typeof window === "undefined") {
    return defaultOwnerSettings;
  }

  const value = window.localStorage.getItem(OWNER_SETTINGS_STORAGE_KEY);

  if (!value) {
    return fallbackOwnerSettings();
  }

  try {
    const parsed = JSON.parse(value);
    if (isApiConfigured() && !ownedByCurrentSession(parsed?.[SESSION_STAMP])) {
      return defaultOwnerSettings;
    }
    return normalizeOwnerSettings(parsed);
  } catch {
    window.localStorage.removeItem(OWNER_SETTINGS_STORAGE_KEY);
    return fallbackOwnerSettings();
  }
}

const ownerSettingsListeners = new Set<() => void>();

export function writeOwnerSettings(settings: OwnerSettings) {
  if (typeof window === "undefined") {
    return;
  }

  const sessionKey = getAuthSessionKey();
  if (isApiConfigured() && sessionKey === null) {
    // No sign-in to own them: private details are not kept.
    return;
  }

  window.localStorage.setItem(
    OWNER_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...normalizeOwnerSettings(settings),
      [SESSION_STAMP]: sessionKey,
    })
  );

  ownerSettingsListeners.forEach((listener) => listener());
}

/**
 * Forgets the owner details cached in this browser — name, email and contact
 * numbers — when the sign-in they belong to ends. Everything showing them
 * (the portal sidebar) is told, here and in other tabs.
 */
export function clearOwnerSettings() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(OWNER_SETTINGS_STORAGE_KEY);
  ownerSettingsListeners.forEach((listener) => listener());
}

/**
 * Removes cached owner details that the current sign-in does not own: stamped
 * for another sign-in, unstamped, or held while nobody is signed in. They
 * already read as empty; this also takes them off the device, for a sign-in
 * change that happened while nothing was listening. Details stamped for the
 * sign-in stored now (including one a newer tab just made) are kept.
 */
export function forgetOwnerSettingsOfOtherSessions() {
  if (typeof window === "undefined" || !isApiConfigured()) {
    return;
  }

  const value = window.localStorage.getItem(OWNER_SETTINGS_STORAGE_KEY);
  if (!value) {
    return;
  }

  let stamp: unknown = undefined;
  try {
    stamp = JSON.parse(value)?.[SESSION_STAMP];
  } catch {
    // Unreadable: not the current sign-in's.
  }

  if (!ownedByCurrentSession(stamp)) {
    clearOwnerSettings();
  }
}

/**
 * Subscribe to owner-settings changes so owner-facing UI (e.g. the portal
 * sidebar) stays in sync after a save, including edits made in another tab.
 */
export function subscribeOwnerSettings(callback: () => void): () => void {
  ownerSettingsListeners.add(callback);

  function handleStorage(event: StorageEvent) {
    if (event.key === OWNER_SETTINGS_STORAGE_KEY) {
      callback();
    }
  }

  window.addEventListener("storage", handleStorage);
  // A sign-in change changes what the cache reads as, even untouched.
  const unsubscribeSession = subscribeAuthSession(() => callback());

  return () => {
    ownerSettingsListeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
    unsubscribeSession();
  };
}

/**
 * Whether the owner has at least one contact number a finder could actually
 * use (a valid phone or WhatsApp number). Drives the "Add your contact
 * details" reminder — it never blocks any flow.
 */
export function hasUsableOwnerContact(
  settings: Pick<OwnerSettings, "phoneNumber" | "whatsappNumber">
): boolean {
  return (
    isValidE164(normalizeStoredPhone(settings.phoneNumber)) ||
    isValidE164(normalizeStoredPhone(settings.whatsappNumber))
  );
}

/** Owner display name for owner-facing UI, with a safe fallback. */
export function getOwnerDisplayName(
  settings: OwnerSettings = defaultOwnerSettings
): string {
  return settings.ownerDisplayName.trim() || "Pet owner";
}

export function normalizeOwnerSettings(value: unknown): OwnerSettings {
  const current = value as Partial<OwnerSettings> & LegacySettings;

  return {
    ownerDisplayName:
      current.ownerDisplayName ?? current.name ?? defaultOwnerSettings.ownerDisplayName,
    email: current.email ?? defaultOwnerSettings.email,
    whatsappNumber: normalizeStoredPhone(
      current.whatsappNumber ?? current.whatsapp ?? defaultOwnerSettings.whatsappNumber
    ),
    phoneNumber: normalizeStoredPhone(
      current.phoneNumber ?? current.phone ?? defaultOwnerSettings.phoneNumber
    ),
    defaultGeneralArea:
      current.defaultGeneralArea ??
      current.defaultArea ??
      defaultOwnerSettings.defaultGeneralArea,
    notificationPreferences: {
      ...defaultOwnerSettings.notificationPreferences,
      ...current.notificationPreferences,
      ...current.notifications,
    },
    marketingEmailOptIn: current.marketingEmailOptIn === true,
  };
}

export function getEffectivePetContact(
  pet: {
    name: string;
    generalArea: string;
    owner: Pet["owner"] | PublicPetProfile["owner"];
    contactOverride?: Pet["contactOverride"];
  },
  settings: OwnerSettings = defaultOwnerSettings
) {
  const usesDefaults = pet.contactOverride?.useOwnerDefaults === true;
  const override = pet.contactOverride;

  const ownerDisplayName = usesDefaults
    ? settings.ownerDisplayName
    : override?.ownerDisplayName ?? pet.owner.name;
  const whatsappNumber = usesDefaults
    ? settings.whatsappNumber
    : override?.whatsappNumber ?? pet.owner.whatsapp;
  const phoneNumber = usesDefaults
    ? settings.phoneNumber
    : override?.phoneNumber ?? pet.owner.phone;
  const generalArea = usesDefaults
    ? settings.defaultGeneralArea
    : override?.generalArea ?? pet.generalArea;

  return {
    ownerDisplayName: ownerDisplayName.trim(),
    whatsappNumber: normalizeStoredPhone(whatsappNumber),
    phoneNumber: normalizeStoredPhone(phoneNumber),
    generalArea: generalArea.trim(),
    useOwnerDefaults: usesDefaults,
  };
}
