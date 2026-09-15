import { apiRequest } from "@/services/apiClient";
import { getApiBaseUrl } from "@/services/apiConfig";

/**
 * The anonymous social read surface.
 *
 * Deliberately does not go through `canUseApi()` like the owner services do:
 * these reads must work for a visitor with no account and no stored session,
 * which is most of the people who will ever open a shared profile link.
 */

export type PublicMomentSubject = {
  name: string;
  publicSlug: string | null;
  photoUrl: string | null;
  /** The Moment's own pet — derived from the Moment, never stored on the join. */
  isPrimarySubject: boolean;
  /** A quiet status only. Lost Mode never creates or boosts social content. */
  lostModeEnabled: boolean;
};

/** A household's social identity. Never an account or finder-facing name. */
export type PublicOwnerAttribution = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  avatarThumbnailUrl: string | null;
};

export type PublicMomentMedia = {
  id: string;
  type: "image" | "video";
  url: string | null;
  caption: string | null;
  altText: string | null;
  sortOrder: number;
};

export type PublicMomentListItem = {
  id: string;
  title: string;
  momentDate: string | null;
  publishedAt: string | null;
  type: string | null;
  caption: string | null;
  author: PublicOwnerAttribution | null;
  subjects: PublicMomentSubject[];
  media: PublicMomentMedia[];
  /** Counted from the like rows; never stored on the Moment. */
  likeCount: number;
  /** Always false for a visitor with no session. */
  viewerHasLiked: boolean;
};

export type PublicMomentPage = {
  items: PublicMomentListItem[];
  /** Null when there is nothing further. Never infer "done" from a short page. */
  nextCursor: string | null;
};

export type PublicOwnerPet = {
  name: string;
  species: string;
  customSpecies: string | null;
  breed: string | null;
  publicSlug: string;
  photoUrl: string | null;
  photoThumbnailUrl: string | null;
  hasSmartTagProtection: boolean;
  lostModeEnabled: boolean;
};

export type PublicOwnerProfile = {
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  avatarThumbnailUrl: string | null;
  generalArea: string | null;
  allowFollowers: boolean;
  pets: PublicOwnerPet[];
};

export class PublicProfileUnavailableError extends Error {
  constructor(readonly reason: "not-found" | "error") {
    super("This profile is not available.");
    this.name = "PublicProfileUnavailableError";
  }
}

function requireApi() {
  if (!getApiBaseUrl()) {
    throw new PublicProfileUnavailableError("error");
  }
}

export async function getPublicOwnerProfile(
  handle: string
): Promise<PublicOwnerProfile> {
  requireApi();

  const response = await apiRequest<PublicOwnerProfile>(
    `/api/v1/public/owners/${encodeURIComponent(handle)}`,
    { auth: false }
  );

  if (!response.data) {
    throw new PublicProfileUnavailableError("not-found");
  }

  return {
    ...response.data,
    pets: response.data.pets ?? [],
  };
}

export async function getPublicOwnerMoments(
  handle: string,
  cursor?: string
): Promise<PublicMomentPage> {
  requireApi();

  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiRequest<PublicMomentPage>(
    `/api/v1/public/owners/${encodeURIComponent(handle)}/moments${query}`,
    { auth: false }
  );

  return normalizePage(response.data);
}

export async function getPublicPetMoments(
  publicSlug: string,
  cursor?: string
): Promise<PublicMomentPage> {
  requireApi();

  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiRequest<PublicMomentPage>(
    `/api/v1/public/pets/${encodeURIComponent(publicSlug)}/moments${query}`,
    { auth: false }
  );

  return normalizePage(response.data);
}

function normalizePage(page?: PublicMomentPage): PublicMomentPage {
  return {
    items: (page?.items ?? []).map((item) => ({
      ...item,
      author: item.author ?? null,
      subjects: (item.subjects ?? []).map((subject) => ({
        ...subject,
        isPrimarySubject: subject.isPrimarySubject ?? false,
        lostModeEnabled: subject.lostModeEnabled ?? false,
      })),
      media: item.media ?? [],
      likeCount: item.likeCount ?? 0,
      viewerHasLiked: item.viewerHasLiked ?? false,
    })),
    nextCursor: page?.nextCursor ?? null,
  };
}
