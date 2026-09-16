import {
  getPublicApiBaseUrlForOwner,
  ownerHtmlHeaders,
} from "./ownerProfileEdge";
import { productionSiteOrigin } from "./publicProfileEdge";

/**
 * Serves `/moments/{momentId}` — one Moment on its own page.
 *
 * The site is a static export with no Next.js server, so this Pages Function is
 * the only place per-request work can happen. It does two things: it refuses a
 * request that is not shaped like a Moment id before it can reach the origin,
 * and it rewrites the static shell's &lt;head&gt; so a shared Moment previews as
 * that Moment rather than as the generic app.
 *
 * It decides nothing about visibility. It asks the same public endpoint the
 * browser will ask a moment later, and that endpoint applies the whole social
 * check — Moment public, published, not archived, household still in Social, no
 * block between the two accounts. A Moment that is unavailable there is
 * unavailable here, and for the same single reason: unavailable.
 */

const requestTimeoutMs = 8_000;
const maxResponseBytes = 64 * 1024;

type EdgeContext = EventContext<
  MyPetLinkPagesEnv,
  "momentId",
  Record<string, unknown>
>;
type FetchLike = typeof fetch;

export type EdgeMoment = {
  id: string;
  title: string;
  caption?: string | null;
  authorDisplayName?: string | null;
  petNames: string[];
  imageUrl?: string | null;
};

/**
 * Moment ids are random v4 UUIDs. Checking the shape here means a malformed or
 * probing path never becomes an origin request.
 */
export function isValidMomentId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function fetchWithTimeout(
  fetcher: FetchLike,
  url: URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(url.toString(), { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMoment(
  env: MyPetLinkPagesEnv,
  momentId: string,
  fetcher: FetchLike = fetch
): Promise<
  { kind: "ok"; moment: EdgeMoment } | { kind: "not-found" } | { kind: "error" }
> {
  const apiBase = getPublicApiBaseUrlForOwner(env);

  if (!apiBase || !isValidMomentId(momentId)) {
    return { kind: "error" };
  }

  const url = new URL(
    `/api/v1/public/moments/${encodeURIComponent(momentId)}`,
    `${apiBase}/`
  );

  try {
    const response = await fetchWithTimeout(
      fetcher,
      url,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "MyPetLink-Cloudflare-Social/1.0",
        },
      },
      requestTimeoutMs
    );

    if (response.status === 404) {
      return { kind: "not-found" };
    }

    if (!response.ok) {
      return { kind: "error" };
    }

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
      return { kind: "error" };
    }

    const envelope = JSON.parse(text) as { data?: Record<string, unknown> };
    const moment = parseEdgeMoment(envelope.data);

    return moment ? { kind: "ok", moment } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

function parseEdgeMoment(value: unknown): EdgeMoment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;

  if (typeof source.id !== "string" || typeof source.title !== "string") {
    return null;
  }

  const author = source.author as { displayName?: unknown } | null | undefined;
  const subjects = Array.isArray(source.subjects) ? source.subjects : [];
  const media = Array.isArray(source.media) ? source.media : [];

  // Only a picture makes a link preview. A video's own file is not an image, so
  // a Moment that leads with one previews without a thumbnail rather than with
  // a broken one.
  const firstImage = media.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "image" &&
      typeof (item as { url?: unknown }).url === "string"
  ) as { url: string } | undefined;

  return {
    id: source.id,
    title: source.title,
    caption: typeof source.caption === "string" ? source.caption : null,
    authorDisplayName:
      author && typeof author.displayName === "string"
        ? author.displayName
        : null,
    petNames: subjects
      .map((subject) =>
        subject &&
        typeof subject === "object" &&
        typeof (subject as { name?: unknown }).name === "string"
          ? (subject as { name: string }).name
          : ""
      )
      .filter(Boolean),
    imageUrl: firstImage?.url ?? null,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanText(value: string, maxLength: number) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…`
    : collapsed;
}

export function buildMomentHead(moment: EdgeMoment) {
  const title = cleanText(moment.title, 70) || "A MyPetLink Moment";
  const pets =
    moment.petNames.length > 0 ? moment.petNames.slice(0, 3).join(", ") : "";
  const household = cleanText(moment.authorDisplayName ?? "", 60);
  const fallback = [pets, household].filter(Boolean).join(" · ");
  const description =
    cleanText(moment.caption ?? "", 140) ||
    fallback ||
    "A Moment shared on MyPetLink.";
  const canonical = `${productionSiteOrigin}/moments/${moment.id}`;

  const tags = [
    `<title>${escapeHtml(title)} | MyPetLink</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta name="twitter:card" content="${moment.imageUrl ? "summary_large_image" : "summary"}">`,
  ];

  if (moment.imageUrl) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(moment.imageUrl)}">`
    );
  }

  return tags.join("\n");
}

export function unavailableMomentResponse(state: "not-found" | "error") {
  const status = state === "not-found" ? 404 : 503;
  const body =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Moment unavailable | MyPetLink</title>` +
    `<meta name="robots" content="noindex">` +
    `</head><body><main><h1>This Moment isn't available</h1>` +
    `<p>It may have been taken down, or the family may not be sharing it right now.</p>` +
    `</main></body></html>`;

  return new Response(body, { headers: ownerHtmlHeaders(), status });
}

export async function handleMomentRequest(
  context: EdgeContext,
  dependencies: { fetch?: FetchLike } = {}
) {
  const raw = context.params.momentId;
  const requested = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const momentId = requested.trim().toLowerCase();

  if (!isValidMomentId(momentId)) {
    return unavailableMomentResponse("not-found");
  }

  // One Moment has one address. Anything else redirects to it rather than
  // becoming a second URL for the same content.
  if (requested !== momentId) {
    return new Response(null, {
      headers: { location: `/moments/${momentId}`, "cache-control": "no-store" },
      status: 301,
    });
  }

  const result = await fetchMoment(
    context.env,
    momentId,
    dependencies.fetch ?? fetch
  );

  if (result.kind === "not-found") {
    return unavailableMomentResponse("not-found");
  }

  if (result.kind === "error") {
    return unavailableMomentResponse("error");
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
    return unavailableMomentResponse("error");
  }

  const html = await assetResponse.text();
  const rewritten = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    buildMomentHead(result.moment)
  );

  return new Response(rewritten, {
    headers: ownerHtmlHeaders(assetResponse.headers),
    status: 200,
  });
}
