/**
 * `X-Robots-Tag` values for responses produced by Pages Functions.
 *
 * Cloudflare does not apply `public/_headers` to a response a Function
 * generates, so every route claimed in `public/_routes.json` states its own
 * indexing policy here, as an HTTP header, in addition to the robots meta tag
 * in its HTML. The header also covers what a meta tag cannot: responses that
 * are not HTML (social-card images, a passed-through asset) and any path where
 * the HTML head is not rewritten.
 *
 * These mirror `seoRoutes.ts` (`noindex-follow` / `noindex-nofollow`). They
 * only tell search engines what to keep out of results: link-preview crawlers
 * (WhatsApp, Facebook, X) ignore them, so shared previews are unaffected.
 */
export const robotsHeaderName = "X-Robots-Tag";

/** Finder pages, shared profiles and Moments: never a result, links followed. */
export const noindexFollow = "noindex, follow";

/** Followers and following lists: neither the page nor its links. */
export const noindexNofollow = "noindex, nofollow";

/** Images generated for link previews: never in image search. */
export const noindexImage = "noindex";

/**
 * The same response with `X-Robots-Tag` set. Responses returned by
 * `context.next()` or the cache can have immutable headers, so this always
 * builds a new Response rather than mutating the one it was given.
 */
export function withRobotsHeader(response: Response, value: string) {
  const headers = new Headers(response.headers);
  headers.set(robotsHeaderName, value);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
