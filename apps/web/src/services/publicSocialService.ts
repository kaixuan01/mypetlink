import { apiRequest, isApiClientError } from "@/services/apiClient";
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

/**
 * Another household that accepted an invitation into a Moment, and the pets it
 * placed there. Kept apart from the Moment's own subjects so a collaborator's
 * pet is never presented as the author's.
 */
export type PublicMomentCollaboration = {
  household: PublicOwnerAttribution;
  pets: PublicMomentSubject[];
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
  /** Counted through the same viewer-specific rules as the Comment list. */
  commentCount?: number;
  /** Accepted, currently visible collaborators. Absent from older responses. */
  collaborations?: PublicMomentCollaboration[];
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

  let response: Awaited<ReturnType<typeof apiRequest<PublicOwnerProfile>>>;

  try {
    response = await apiRequest<PublicOwnerProfile>(
      `/api/v1/public/owners/${encodeURIComponent(handle)}`,
      { auth: false }
    );
  } catch (error) {
    // The public API intentionally gives one 404 for every profile it will not
    // show. Missing, Community off and privacy-hidden must remain the same
    // answer here; only a real transport/server failure earns Retry.
    if (isApiClientError(error) && error.status === 404) {
      throw new PublicProfileUnavailableError("not-found");
    }

    throw error;
  }

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
    `/api/v1/public/owners/${encodeURIComponent(handle)}/moments${query}`
  );

  return normalizeMomentPage(response.data);
}

export async function getPublicPetMoments(
  publicSlug: string,
  cursor?: string
): Promise<PublicMomentPage> {
  requireApi();

  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiRequest<PublicMomentPage>(
    `/api/v1/public/pets/${encodeURIComponent(publicSlug)}/moments${query}`
  );

  return normalizeMomentPage(response.data);
}

/**
 * One Moment, for its own page.
 *
 * The same shape a card is built from, so the page that opens after a tap is
 * describing the Moment the same way the card did. Its media arrives at full
 * resolution rather than grid size, which is the one difference — one Moment
 * filling a screen earns the larger file; a page of tiles does not.
 */
export async function getPublicMoment(
  momentId: string
): Promise<PublicMomentListItem> {
  requireApi();

  let response: Awaited<ReturnType<typeof apiRequest<PublicMomentListItem>>>;

  try {
    response = await apiRequest<PublicMomentListItem>(
      `/api/v1/public/moments/${encodeURIComponent(momentId)}`
    );
  } catch (error) {
    // The API answers 404 for every Moment it will not show — missing,
    // private, taken down, or behind a block — and deliberately says no more.
    // That is "not available", not "something went wrong": the page must not
    // offer Retry for an answer that retrying cannot change.
    if (isApiClientError(error) && error.status === 404) {
      throw new PublicProfileUnavailableError("not-found");
    }

    throw error;
  }

  if (!response.data) {
    throw new PublicProfileUnavailableError("not-found");
  }

  return normalizeMoment(response.data);
}

/**
 * Fills in anything an older or partial response left out.
 *
 * Shared by every listing — profile, pet, feed, Explore — so one contract gap
 * cannot show up as a crash on one surface and a blank on another.
 */
export function normalizeMomentPage(page?: PublicMomentPage): PublicMomentPage {
  return {
    items: (page?.items ?? []).map(normalizeMoment),
    nextCursor: page?.nextCursor ?? null,
  };
}

function normalizeMoment(item: PublicMomentListItem): PublicMomentListItem {
  return {
    ...item,
    author: item.author ?? null,
    subjects: (item.subjects ?? []).map((subject) => ({
      ...subject,
      isPrimarySubject: subject.isPrimarySubject ?? false,
      lostModeEnabled: subject.lostModeEnabled ?? false,
    })),
    media: item.media ?? [],
    likeCount: item.likeCount ?? 0,
    commentCount: item.commentCount ?? 0,
    collaborations: (item.collaborations ?? []).map((collaboration) => ({
      household: collaboration.household,
      pets: collaboration.pets ?? [],
    })),
    viewerHasLiked: item.viewerHasLiked ?? false,
  };
}
