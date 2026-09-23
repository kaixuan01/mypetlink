/**
 * What a Moment's page is called, in the browser tab and in a shared link.
 *
 * Two different runtimes name this page. The Cloudflare Pages Function writes
 * it into the HTML before anything runs, so a crawler or a chat preview sees
 * the real Moment; the browser then hydrates and has to keep saying the same
 * thing. When they disagreed, the tab flipped from the Moment's name to
 * something else after it had loaded. So both read their words from here.
 *
 * Deliberately free of imports: the Pages Function bundle compiles this file
 * on its own (see tsconfig.functions.json).
 */

export const momentNotFoundTitle = "Moment not found";
export const momentUnavailableTitle = "Moment unavailable";

/**
 * A `<meta>` the edge writes beside the title: `content` is the Moment's id and
 * `data-title` the title it put in the tab. The page reads it while its own
 * request is still in flight, so the tab keeps the Moment's name instead of
 * showing the shell's "Loading" in between. Keyed by id so a stale tag can
 * never name a different Moment.
 */
export const momentTitleMetaName = "mypetlink-moment";

const fallbackMomentTitle = "A MyPetLink Moment";
const maxMomentTitleLength = 70;

/**
 * The Moment's own title, tidied for a tab: whitespace collapsed, and long
 * titles shortened with an ellipsis rather than pushing the product name off
 * the end of the tab.
 */
export function momentTitleText(title: string | null | undefined) {
  const collapsed = (title ?? "").replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return fallbackMomentTitle;
  }

  return collapsed.length > maxMomentTitleLength
    ? `${collapsed.slice(0, maxMomentTitleLength - 1).trimEnd()}…`
    : collapsed;
}
