import { apiRequest } from "@/services/apiClient";
import {
  normalizeMomentPage,
  type PublicMomentPage,
} from "@/services/publicSocialService";

/**
 * The signed-in owner's home feed.
 *
 * The one social read that requires a session: a feed is made entirely of
 * relationships the caller chose, so there is nothing in it to show a visitor
 * who has none. Whose feed is never named by the client — the API builds it for
 * whoever the token says is asking.
 */
/**
 * A page of the feed, and whether the viewer follows anybody at all.
 *
 * The second is not derivable from the first. An empty page means either "you
 * have not followed anyone yet" or "nobody you follow has posted lately", and
 * those need opposite things said to them — so the relationship comes from the
 * server beside the page rather than being guessed from its length.
 */
export type SocialFeedPage = PublicMomentPage & {
  hasFollowing: boolean;
};

export async function getSocialFeed(cursor?: string): Promise<SocialFeedPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiRequest<PublicMomentPage & { hasFollowing?: boolean }>(
    `/api/v1/social/feed${query}`
  );

  return {
    ...normalizeMomentPage(response.data),
    // Absent only if an older API is answering; treating that as "follows
    // somebody" keeps the quieter copy, which is the safe way to be wrong.
    hasFollowing: response.data?.hasFollowing ?? true,
  };
}
