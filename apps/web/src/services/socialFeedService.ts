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
export async function getSocialFeed(cursor?: string): Promise<PublicMomentPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiRequest<PublicMomentPage>(
    `/api/v1/social/feed${query}`
  );

  return normalizeMomentPage(response.data);
}
