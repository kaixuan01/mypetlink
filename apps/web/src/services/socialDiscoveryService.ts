import { apiRequest } from "@/services/apiClient";
import {
  normalizeMomentPage,
  type PublicMomentPage,
  type PublicOwnerAttribution,
} from "@/services/publicSocialService";

/**
 * Explore and search.
 *
 * Readable without a session on purpose: somebody who followed a shared link
 * should be able to look around before deciding whether to join. A session
 * changes two things only — which accounts are excluded for a block, and
 * whether a card already says "Following".
 */

export type SocialPetCard = {
  name: string;
  species: string;
  customSpecies: string | null;
  breed: string | null;
  publicSlug: string;
  photoThumbnailUrl: string | null;
  lostModeEnabled: boolean;
  /** The household that shares this pet — the Follow target, never the pet. */
  owner: PublicOwnerAttribution;
  viewerFollowsOwner: boolean;
};

export type SocialPetPage = {
  items: SocialPetCard[];
  nextCursor: string | null;
};

export type SocialSpeciesOption = {
  species: string;
  label: string;
  petCount: number;
};

export type SocialOwnerCard = {
  handle: string;
  displayName: string;
  avatarThumbnailUrl: string | null;
  generalArea: string | null;
  viewerFollows: boolean;
  isSelf: boolean;
};

export type SocialSearchResults = {
  query: string;
  pets: SocialPetCard[];
  owners: SocialOwnerCard[];
};

/** Below this the box is somebody still typing, not a question. */
export const minimumSearchLength = 2;

export async function getSuggestedPets(
  species?: string
): Promise<SocialPetCard[]> {
  const query = speciesQuery(species);
  const response = await apiRequest<SocialPetPage>(
    `/api/v1/social/explore/pets${query}`
  );

  return response.data?.items ?? [];
}

export async function getExploreMoments(
  species?: string,
  cursor?: string
): Promise<PublicMomentPage> {
  const parts: string[] = [];
  if (species && species !== "all") parts.push(`species=${encodeURIComponent(species)}`);
  if (cursor) parts.push(`cursor=${encodeURIComponent(cursor)}`);

  const response = await apiRequest<PublicMomentPage>(
    `/api/v1/social/explore/moments${parts.length ? `?${parts.join("&")}` : ""}`
  );

  return normalizeMomentPage(response.data);
}

export async function getSocialSpecies(): Promise<SocialSpeciesOption[]> {
  const response = await apiRequest<SocialSpeciesOption[]>(
    "/api/v1/social/explore/species"
  );

  return response.data ?? [];
}

export async function searchSocial(
  query: string,
  type?: "pets" | "owners",
  /**
   * Aborts a search the caller has moved on from. Typing is faster than the
   * network, so without this a slow answer to an earlier query can arrive after
   * a newer one and replace it.
   */
  signal?: AbortSignal
): Promise<SocialSearchResults> {
  const parts = [`q=${encodeURIComponent(query)}`];
  if (type) parts.push(`type=${type}`);

  const response = await apiRequest<SocialSearchResults>(
    `/api/v1/social/search?${parts.join("&")}`,
    { signal }
  );

  return {
    query: response.data?.query ?? query,
    pets: response.data?.pets ?? [],
    owners: response.data?.owners ?? [],
  };
}

function speciesQuery(species?: string) {
  return species && species !== "all"
    ? `?species=${encodeURIComponent(species)}`
    : "";
}
