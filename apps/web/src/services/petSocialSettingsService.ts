import { apiRequest } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import type { ApiResponse } from "@/types";

/**
 * One pet's place in MyPetLink Social, as its owner controls it.
 *
 * Four separate decisions meet on this screen and none of them implies another:
 * the household participates, this pet participates, strangers may discover
 * this pet, and this pet has a shareable link. Turning one on never turns
 * another on.
 */
export type PetSocialSettings = {
  petId: string;
  name: string;
  photoUrl: string;
  photoThumbnailUrl: string;
  /** This pet appears on the owner's Social profile and in Social Moments. */
  isSocialEnabled: boolean;
  /** People who were not given a link may find this pet. */
  isDiscoverable: boolean;
  /** False while something stands in the way; `missingRequirements` says what. */
  canEnableSocial: boolean;
  /** Stable keys, not copy: "publicProfile", "lifecycle". */
  missingRequirements: string[];
  rowVersion: string;
};

export type PetSocialSettingsList = {
  /** The master switch every pet below sits under. Read only, here. */
  ownerSocialEnabled: boolean;
  pets: PetSocialSettings[];
};

export type PetSocialSettingsUpdate = {
  isSocialEnabled?: boolean;
  isDiscoverable?: boolean;
  rowVersion?: string;
};

type BackendPetSocialSettings = {
  petId?: string | null;
  name?: string | null;
  photoUrl?: string | null;
  photoThumbnailUrl?: string | null;
  isSocialEnabled?: boolean | null;
  isDiscoverable?: boolean | null;
  canEnableSocial?: boolean | null;
  missingRequirements?: string[] | null;
  rowVersion?: string | null;
};

type BackendPetSocialSettingsList = {
  ownerSocialEnabled?: boolean | null;
  pets?: BackendPetSocialSettings[] | null;
};

export const emptyPetSocialSettingsList: PetSocialSettingsList = {
  ownerSocialEnabled: false,
  pets: [],
};

function mapPet(payload: BackendPetSocialSettings): PetSocialSettings {
  return {
    petId: payload.petId ?? "",
    name: payload.name ?? "",
    photoUrl: payload.photoUrl ?? "",
    photoThumbnailUrl: payload.photoThumbnailUrl ?? payload.photoUrl ?? "",

    // Absent means "not in Social", never "unknown". A privacy switch that
    // defaults to on when a field is missing is the wrong way round.
    isSocialEnabled: payload.isSocialEnabled ?? false,
    isDiscoverable: payload.isDiscoverable ?? false,
    canEnableSocial: payload.canEnableSocial ?? false,
    missingRequirements: payload.missingRequirements ?? [],
    rowVersion: payload.rowVersion ?? "",
  };
}

function mapList(payload?: BackendPetSocialSettingsList): PetSocialSettingsList {
  if (!payload) {
    return emptyPetSocialSettingsList;
  }

  return {
    ownerSocialEnabled: payload.ownerSocialEnabled ?? false,
    pets: (payload.pets ?? []).map(mapPet),
  };
}

function localResponse<T>(data: T): ApiResponse<T> {
  return {
    data,
    meta: { requestId: `local_${Date.now()}`, source: "mock" },
  };
}

export async function getPetSocialSettings(): Promise<
  ApiResponse<PetSocialSettingsList>
> {
  if (!canUseApi()) {
    // Without a connection there is nothing to read. The empty, switched-off
    // shape keeps the screen honest rather than inventing consent locally.
    return localResponse(emptyPetSocialSettingsList);
  }

  const response = await apiRequest<BackendPetSocialSettingsList>(
    "/api/v1/social/me/pets"
  );

  return {
    data: mapList(response.data),
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}

export async function updatePetSocialSettings(
  petId: string,
  update: PetSocialSettingsUpdate
): Promise<ApiResponse<PetSocialSettings>> {
  const response = await apiRequest<BackendPetSocialSettings>(
    `/api/v1/social/me/pets/${encodeURIComponent(petId)}`,
    {
      method: "PUT",
      body: {
        isSocialEnabled: update.isSocialEnabled ?? null,
        isDiscoverable: update.isDiscoverable ?? null,
        rowVersion: update.rowVersion || null,
      },
    }
  );

  return {
    data: mapPet(response.data ?? {}),
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}
