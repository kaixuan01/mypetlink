import { normalizeStoredPhone } from "@/lib/phone";
import type { Pet, PublicPetProfile } from "@/types";

export const OWNER_SETTINGS_STORAGE_KEY = "mypetlink_owner_settings";

export type OwnerPrivacyDefaults = Pick<
  Pet["visibility"],
  | "showOwnerName"
  | "showGeneralArea"
  | "showPhone"
  | "showWhatsapp"
  | "showEmergencyNote"
  | "showCareBadges"
  | "showMoments"
  | "showTimeline"
  | "showBirthdayOnTimeline"
  | "showAdoptionDayOnTimeline"
  | "showHealthSummary"
>;

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
  privacyDefaults: OwnerPrivacyDefaults;
  notificationPreferences: OwnerNotificationPreferences;
};

type LegacySettings = Partial<{
  name: string;
  email: string;
  whatsapp: string;
  phone: string;
  defaultArea: string;
  privacy: Partial<{
    ownerName: boolean;
    generalArea: boolean;
    whatsapp: boolean;
    moments: boolean;
    careNotesPrivate: boolean;
  }>;
  notifications: Partial<OwnerNotificationPreferences>;
}>;

export const defaultOwnerSettings: OwnerSettings = {
  ownerDisplayName: "Aina Rahman",
  email: "aina@example.com",
  whatsappNumber: "+60123456789",
  phoneNumber: "+60123456789",
  defaultGeneralArea: "Petaling Jaya, Selangor",
  privacyDefaults: {
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
  notificationPreferences: {
    whatsappReminders: true,
    emailReminders: true,
    careDigest: true,
  },
};

export function readOwnerSettings(): OwnerSettings {
  if (typeof window === "undefined") {
    return defaultOwnerSettings;
  }

  const value = window.localStorage.getItem(OWNER_SETTINGS_STORAGE_KEY);

  if (!value) {
    return defaultOwnerSettings;
  }

  try {
    return normalizeOwnerSettings(JSON.parse(value));
  } catch {
    window.localStorage.removeItem(OWNER_SETTINGS_STORAGE_KEY);
    return defaultOwnerSettings;
  }
}

const ownerSettingsListeners = new Set<() => void>();

export function writeOwnerSettings(settings: OwnerSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    OWNER_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeOwnerSettings(settings))
  );

  ownerSettingsListeners.forEach((listener) => listener());
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

  return () => {
    ownerSettingsListeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Owner display name for owner-facing UI, with a safe fallback. */
export function getOwnerDisplayName(
  settings: OwnerSettings = defaultOwnerSettings
): string {
  return settings.ownerDisplayName.trim() || "Pet owner";
}

export function normalizeOwnerSettings(value: unknown): OwnerSettings {
  const current = value as Partial<OwnerSettings> & LegacySettings;
  const privacyDefaults = {
    ...defaultOwnerSettings.privacyDefaults,
    ...current.privacyDefaults,
  };

  if (current.privacy) {
    privacyDefaults.showOwnerName =
      current.privacy.ownerName ?? privacyDefaults.showOwnerName;
    privacyDefaults.showGeneralArea =
      current.privacy.generalArea ?? privacyDefaults.showGeneralArea;
    privacyDefaults.showWhatsapp =
      current.privacy.whatsapp ?? privacyDefaults.showWhatsapp;
    privacyDefaults.showMoments =
      current.privacy.moments ?? privacyDefaults.showMoments;
    privacyDefaults.showHealthSummary =
      current.privacy.careNotesPrivate === undefined
        ? privacyDefaults.showHealthSummary
        : !current.privacy.careNotesPrivate;
  }

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
    privacyDefaults,
    notificationPreferences: {
      ...defaultOwnerSettings.notificationPreferences,
      ...current.notificationPreferences,
      ...current.notifications,
    },
  };
}

export function getDefaultPetVisibility(settings: OwnerSettings): Pet["visibility"] {
  return {
    ...defaultOwnerSettings.privacyDefaults,
    ...settings.privacyDefaults,
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
    ownerDisplayName:
      ownerDisplayName.trim() ||
      settings.ownerDisplayName.trim() ||
      `${pet.name}'s owner`,
    whatsappNumber: normalizeStoredPhone(whatsappNumber),
    phoneNumber: normalizeStoredPhone(phoneNumber),
    generalArea:
      generalArea.trim() || settings.defaultGeneralArea || "Malaysia",
    useOwnerDefaults: usesDefaults,
  };
}
