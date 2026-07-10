import {
  defaultOwnerSettings,
  normalizeOwnerSettings,
  readOwnerSettings,
  writeOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { apiRequest } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import type { BackendOwnerProfile } from "@/services/apiDtos";
import type { ApiResponse } from "@/types";

export async function getOwnerProfileSettings(): Promise<ApiResponse<OwnerSettings>> {
  if (!canUseApi()) {
    return {
      data: readOwnerSettings(),
      meta: { requestId: `local_${Date.now()}`, source: "mock" },
    };
  }

  const response = await apiRequest<BackendOwnerProfile>("/api/v1/owner/profile");
  const settings = mapOwnerProfileToSettings(response.data);
  writeOwnerSettings(settings);

  return {
    data: settings,
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}

export async function updateOwnerProfileSettings(
  settings: OwnerSettings
): Promise<ApiResponse<OwnerSettings>> {
  if (!canUseApi()) {
    writeOwnerSettings(settings);
    return {
      data: readOwnerSettings(),
      meta: { requestId: `local_${Date.now()}`, source: "mock" },
    };
  }

  const response = await apiRequest<BackendOwnerProfile>("/api/v1/owner/profile", {
    method: "PUT",
    body: {
      displayName: settings.ownerDisplayName,
      phoneE164: settings.phoneNumber || null,
      whatsappE164: settings.whatsappNumber || null,
      defaultGeneralArea: settings.defaultGeneralArea,
      privacyDefaults: settings.privacyDefaults,
      notificationPreferences: settings.notificationPreferences,
    },
  });
  const updatedSettings = mapOwnerProfileToSettings(response.data);
  writeOwnerSettings(updatedSettings);

  return {
    data: updatedSettings,
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}

export function mapOwnerProfileToSettings(
  profile?: BackendOwnerProfile
): OwnerSettings {
  if (!profile) {
    return readOwnerSettings();
  }

  return normalizeOwnerSettings({
    ownerDisplayName:
      profile.displayName || profile.defaultContact.displayName,
    email: profile.email,
    phoneNumber: profile.phoneE164 ?? "",
    whatsappNumber: profile.whatsappE164 ?? "",
    defaultGeneralArea: profile.defaultGeneralArea ?? "",
    privacyDefaults: profile.defaultPrivacy ?? defaultOwnerSettings.privacyDefaults,
    notificationPreferences: {
      ...defaultOwnerSettings.notificationPreferences,
      ...profile.notificationPreferences,
    },
  });
}
