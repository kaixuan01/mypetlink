import { apiRequest } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import type { ApiResponse } from "@/types";

/**
 * The owner's PUBLIC social identity.
 *
 * Separate from the account identity (email, sign-in name) and from the
 * finder-facing owner name on a Safety Profile. Nothing here is ever derived
 * from either of those.
 */
export type OwnerSocialProfile = {
  handle: string;
  displayName: string;
  bio: string;
  avatarMediaId: string;
  avatarUrl: string;
  avatarThumbnailUrl: string;
  generalArea: string;
  isSocialEnabled: boolean;
  isDiscoverable: boolean;
  allowFollowers: boolean;
  /** False until a handle and a display name exist. */
  canEnableSocial: boolean;
  /** Which of "handle" / "displayName" still have to be filled in. */
  missingRequirements: string[];
  /** Set while a handle-change cooldown is running. */
  handleChangeAvailableAt: string;
  rowVersion: string;
};

export type OwnerSocialProfileUpdate = {
  displayName?: string;
  bio?: string;
  generalArea?: string;
  isSocialEnabled?: boolean;
  isDiscoverable?: boolean;
  allowFollowers?: boolean;
  rowVersion?: string;
};

type BackendOwnerSocialProfile = {
  handle?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarMediaFileId?: string | null;
  avatarUrl?: string | null;
  avatarThumbnailUrl?: string | null;
  generalArea?: string | null;
  isSocialEnabled?: boolean | null;
  isDiscoverable?: boolean | null;
  allowFollowers?: boolean | null;
  canEnableSocial?: boolean | null;
  missingRequirements?: string[] | null;
  handleChangeAvailableAt?: string | null;
  rowVersion?: string | null;
};

type BackendHandleAvailability = {
  handle?: string | null;
  isAvailable?: boolean | null;
};

/**
 * The starting state for an account that has not joined anything: switched off
 * and empty. Used as the local fallback and as the shape the UI renders before
 * the first response arrives, so no screen ever implies participation that does
 * not exist.
 */
export const emptyOwnerSocialProfile: OwnerSocialProfile = {
  handle: "",
  displayName: "",
  bio: "",
  avatarMediaId: "",
  avatarUrl: "",
  avatarThumbnailUrl: "",
  generalArea: "",
  isSocialEnabled: false,
  isDiscoverable: false,
  allowFollowers: true,
  canEnableSocial: false,
  missingRequirements: ["handle", "displayName"],
  handleChangeAvailableAt: "",
  rowVersion: "",
};

function mapProfile(payload?: BackendOwnerSocialProfile): OwnerSocialProfile {
  if (!payload) {
    return emptyOwnerSocialProfile;
  }

  return {
    handle: payload.handle ?? "",
    displayName: payload.displayName ?? "",
    bio: payload.bio ?? "",
    avatarMediaId: payload.avatarMediaFileId ?? "",
    avatarUrl: payload.avatarUrl ?? "",
    avatarThumbnailUrl: payload.avatarThumbnailUrl ?? payload.avatarUrl ?? "",
    generalArea: payload.generalArea ?? "",
    isSocialEnabled: payload.isSocialEnabled ?? false,
    isDiscoverable: payload.isDiscoverable ?? false,
    allowFollowers: payload.allowFollowers ?? true,
    canEnableSocial: payload.canEnableSocial ?? false,
    missingRequirements: payload.missingRequirements ?? [],
    handleChangeAvailableAt: payload.handleChangeAvailableAt ?? "",
    rowVersion: payload.rowVersion ?? "",
  };
}

function localResponse<T>(data: T): ApiResponse<T> {
  return {
    data,
    meta: { requestId: `local_${Date.now()}`, source: "mock" },
  };
}

export async function getOwnerSocialProfile(): Promise<
  ApiResponse<OwnerSocialProfile>
> {
  if (!canUseApi()) {
    // Without a connection there is no social identity to read. Returning the
    // empty, switched-off shape keeps the settings screen honest rather than
    // inventing a profile locally.
    return localResponse(emptyOwnerSocialProfile);
  }

  const response = await apiRequest<BackendOwnerSocialProfile>(
    "/api/v1/social/me/profile"
  );

  return {
    data: mapProfile(response.data),
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}

export async function updateOwnerSocialProfile(
  update: OwnerSocialProfileUpdate
): Promise<ApiResponse<OwnerSocialProfile>> {
  if (!canUseApi()) {
    return localResponse(emptyOwnerSocialProfile);
  }

  const response = await apiRequest<BackendOwnerSocialProfile>(
    "/api/v1/social/me/profile",
    {
      method: "PUT",
      body: {
        displayName: update.displayName ?? null,
        bio: update.bio ?? null,
        generalArea: update.generalArea ?? null,
        isSocialEnabled: update.isSocialEnabled ?? null,
        isDiscoverable: update.isDiscoverable ?? null,
        allowFollowers: update.allowFollowers ?? null,
        rowVersion: update.rowVersion || null,
      },
    }
  );

  return {
    data: mapProfile(response.data),
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}

export async function claimOwnerHandle(
  handle: string
): Promise<ApiResponse<OwnerSocialProfile>> {
  if (!canUseApi()) {
    return localResponse(emptyOwnerSocialProfile);
  }

  const response = await apiRequest<BackendOwnerSocialProfile>(
    "/api/v1/social/me/handle",
    {
      method: "POST",
      body: { handle },
    }
  );

  return {
    data: mapProfile(response.data),
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}

/**
 * Whether a handle can be claimed.
 *
 * The answer is a plain boolean by design: taken, reserved and screened-out
 * names are all reported the same way, so this cannot be used to work out which
 * handles exist or who holds them.
 */
export async function checkOwnerHandleAvailability(
  handle: string
): Promise<ApiResponse<boolean>> {
  if (!canUseApi()) {
    return localResponse(false);
  }

  const response = await apiRequest<BackendHandleAvailability>(
    `/api/v1/social/handles/${encodeURIComponent(handle)}/available`
  );

  return {
    data: response.data?.isAvailable ?? false,
    meta: {
      requestId: response.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
    },
  };
}
