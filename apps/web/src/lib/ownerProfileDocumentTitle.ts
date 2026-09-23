/**
 * The title contract for a Community Profile, shared by the browser and edge.
 *
 * The public API deliberately answers every hidden profile as the same 404, so
 * the title does the same: it never says whether a handle is missing, Community
 * is off, or another privacy rule withheld the household.
 *
 * Deliberately free of imports: the Pages Function bundle compiles this file
 * on its own (see tsconfig.functions.json).
 */

export const ownerProfileNotFoundTitle = "Community Profile not found";
export const ownerProfileUnavailableTitle = "Community Profile unavailable";
export const ownerProfileTitleMetaName = "mypetlink-owner-profile";

const fallbackOwnerProfileTitle = "Community Profile";
const maxOwnerProfileTitleLength = 70;

/** A household's chosen Community display name, tidied for a browser tab. */
export function ownerProfileTitleText(displayName: string | null | undefined) {
  const collapsed = (displayName ?? "").replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return fallbackOwnerProfileTitle;
  }

  return collapsed.length > maxOwnerProfileTitleLength
    ? `${collapsed.slice(0, maxOwnerProfileTitleLength - 1).trimEnd()}…`
    : collapsed;
}
