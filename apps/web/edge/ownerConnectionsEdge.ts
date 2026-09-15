import {
  isValidOwnerHandle,
  ownerHtmlHeaders,
  resolveOwnerHandle,
  unavailableOwnerResponse,
} from "./ownerProfileEdge";

/**
 * Serves `/u/{handle}/followers` and `/u/{handle}/following`.
 *
 * These pages exist at the edge for the same reason `/u/{handle}` does: the
 * site is a static export, so without a Pages Function there is no asset at a
 * real handle's path to serve at all.
 *
 * Unlike the profile it does NOT fetch the household's details. A followers
 * list is never a link preview and never belongs in search results, so the head
 * is rewritten to a plain noindex title and nothing about the household is put
 * into the HTML. The list itself is fetched by the app, where the API decides
 * what this particular viewer may see.
 */

type EdgeContext = EventContext<
  MyPetLinkPagesEnv,
  "handle",
  Record<string, unknown>
>;
type FetchLike = typeof fetch;

export type ConnectionRelation = "followers" | "following";

export function buildOwnerConnectionsHead(relation: ConnectionRelation) {
  const title = relation === "followers" ? "Followers" : "Following";

  return [
    `<title>${title} | MyPetLink</title>`,
    `<meta name="robots" content="noindex, nofollow">`,
  ].join("\n");
}

export async function handleOwnerConnectionsRequest(
  context: EdgeContext,
  relation: ConnectionRelation,
  dependencies: { fetch?: FetchLike } = {}
) {
  const raw = context.params.handle;
  const requested = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const handle = requested.trim().replace(/^@+/, "").toLowerCase();

  if (!isValidOwnerHandle(handle)) {
    return unavailableOwnerResponse("not-found");
  }

  const fetcher = dependencies.fetch ?? fetch;
  const resolution = await resolveOwnerHandle(context.env, handle, fetcher);

  if (resolution.kind === "not-found") {
    return unavailableOwnerResponse("not-found");
  }

  if (resolution.kind === "error") {
    return unavailableOwnerResponse("error");
  }

  // An old handle, or a differently-cased one: send the visitor to the single
  // canonical URL rather than serving the same list from two addresses.
  const canonicalHandle =
    resolution.kind === "moved"
      ? resolution.currentHandle.toLowerCase()
      : handle;

  if (resolution.kind === "moved" || requested !== handle) {
    return new Response(null, {
      headers: {
        location: `/u/${canonicalHandle}/${relation}`,
        "cache-control": "no-store",
      },
      status: 301,
    });
  }

  if (context.request.method === "HEAD") {
    return new Response(null, { headers: ownerHtmlHeaders(), status: 200 });
  }

  const assetHeaders = new Headers(context.request.headers);
  assetHeaders.delete("if-modified-since");
  assetHeaders.delete("if-none-match");
  assetHeaders.delete("range");

  const assetResponse = await context.next(
    new Request(context.request, { headers: assetHeaders })
  );
  const contentType = assetResponse.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("text/html") || !assetResponse.body) {
    return unavailableOwnerResponse("error");
  }

  const html = await assetResponse.text();
  const rewritten = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    buildOwnerConnectionsHead(relation)
  );

  return new Response(rewritten, {
    headers: ownerHtmlHeaders(assetResponse.headers),
    status: 200,
  });
}
