import {
  defaultOwnerSettings,
  normalizeOwnerSettings,
  readOwnerSettings,
  writeOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import {
  adoptServerPlanLimits,
  freePlanLimits,
  getEffectivePlanLimits,
} from "@/lib/planLimits";
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
  adoptServerPlanLimits(response.data?.plan);
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

  const expectedPhoneNumber = normalizeOptionalContactNumber(settings.phoneNumber);
  const expectedWhatsappNumber = normalizeOptionalContactNumber(
    settings.whatsappNumber
  );
  const response = await apiRequest<BackendOwnerProfile>("/api/v1/owner/profile", {
    method: "PUT",
    body: {
      displayName: settings.ownerDisplayName.trim(),
      phoneE164: expectedPhoneNumber || null,
      whatsappE164: expectedWhatsappNumber || null,
      defaultGeneralArea: settings.defaultGeneralArea.trim(),
      privacyDefaults: settings.privacyDefaults,
      notificationPreferences: settings.notificationPreferences,
    },
  });
  adoptServerPlanLimits(response.data?.plan);
  const updatedSettings = mapOwnerProfileToSettings(response.data);

  // A successful HTTP response is not enough: the returned representation
  // must confirm that both independently optional contact values were saved.
  // This prevents a stale API response from producing a false success state.
  if (
    updatedSettings.phoneNumber !== expectedPhoneNumber ||
    updatedSettings.whatsappNumber !== expectedWhatsappNumber
  ) {
    throw new Error("The saved contact details did not match the requested values.");
  }

  writeOwnerSettings(updatedSettings);

  return {
    data: updatedSettings,
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}

function normalizeOptionalContactNumber(value: string): string {
  return value.trim();
}

export type OwnerPlanSummary = {
  planName: string;
  planStatus: string;
  maxPets: number;
  maxMemoriesPerPet: number;
};

// The owner's current plan and enforced limits — the same values the service
// checks when creating pets or memories. On local data the baseline Free plan
// applies.
export async function getOwnerPlanSummary(): Promise<OwnerPlanSummary> {
  if (canUseApi()) {
    try {
      const response = await apiRequest<BackendOwnerProfile>("/api/v1/owner/profile");
      adoptServerPlanLimits(response.data?.plan);

      const limits = getEffectivePlanLimits();
      return {
        planName: response.data?.plan?.name ?? limits.planName,
        planStatus: response.data?.plan?.status ?? "Available",
        maxPets: limits.maxPets,
        maxMemoriesPerPet: limits.maxMemoriesPerPet,
      };
    } catch {
      // Fall through to the last adopted (or baseline) limits below.
    }
  }

  const limits = getEffectivePlanLimits();
  return {
    planName: limits.planName || freePlanLimits.planName,
    planStatus: "Available",
    maxPets: limits.maxPets,
    maxMemoriesPerPet: limits.maxMemoriesPerPet,
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
