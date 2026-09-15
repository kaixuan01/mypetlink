import {
  productionSiteOrigin,
} from "./publicProfileEdge";

/**
 * Serves `/u/{handle}` — an owner's public social profile.
 *
 * Mirrors the proven `/p/{slug}` handler rather than inventing a second
 * approach. The site is a static export with no Next.js server, so this Pages
 * Function is the only place per-request work can happen: it asks the API where
 * the handle points, redirects if the account has since renamed, and rewrites
 * the static shell's <head> so a shared link previews as that household rather
 * than as the generic app.
 */

const resolveTimeoutMs = 8_000;
const maxResolveResponseBytes = 16 * 1024;

type EdgeContext = EventContext<MyPetLinkPagesEnv, "handle", Record<string, unknown>>;
type FetchLike = typeof fetch;

export type OwnerHandleResolution =
  | { kind: "current"; handle: string }
  | { kind: "moved"; currentHandle: string }
  | { kind: "not-found" }
  | { kind: "error" };

export type EdgeOwnerProfile = {
  handle: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  generalArea?: string | null;
  petNames: string[];
};

/**
 * Handles are 3-30 characters of lowercase letters, digits, underscore and dot,
 * starting with a letter. Checked here as well as in the API so a malformed
 * request never reaches the origin.
 */
export function isValidOwnerHandle(value: string) {
  return /^[a-z][a-z0-9._]{1,28}[a-z0-9]$/.test(value.toLowerCase());
}

export function getPublicApiBaseUrlForOwner(env: MyPetLinkPagesEnv) {
  const configured = env.PUBLIC_API_BASE_URL ?? env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const trimmed = configured.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? trimmed : "";
  } catch {
    return "";
  }
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

export async function resolveOwnerHandle(
  env: MyPetLinkPagesEnv,
  handle: string,
  fetcher: FetchLike = fetch
): Promise<OwnerHandleResolution> {
  const apiBase = getPublicApiBaseUrlForOwner(env);

  if (!apiBase || !isValidOwnerHandle(handle)) {
    return { kind: "error" };
  }

  const url = new URL(
    `/api/v1/public/owners/${encodeURIComponent(handle)}/resolve`,
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
      resolveTimeoutMs
    );

    if (response.status === 404) {
      return { kind: "not-found" };
    }

    if (!response.ok) {
      return { kind: "error" };
    }

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxResolveResponseBytes) {
      return { kind: "error" };
    }

    const envelope = JSON.parse(text) as {
      data?: { handle?: unknown; state?: unknown; currentHandle?: unknown };
    };
    const data = envelope.data;

    if (!data || typeof data.state !== "string") {
      return { kind: "error" };
    }

    if (data.state === "current" && typeof data.handle === "string") {
      return { kind: "current", handle: data.handle };
    }

    if (data.state === "moved" && typeof data.currentHandle === "string") {
      return { kind: "moved", currentHandle: data.currentHandle };
    }

    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function fetchOwnerProfile(
  env: MyPetLinkPagesEnv,
  handle: string,
  fetcher: FetchLike = fetch
): Promise<{ kind: "ok"; profile: EdgeOwnerProfile } | { kind: "not-found" } | { kind: "error" }> {
  const apiBase = getPublicApiBaseUrlForOwner(env);

  if (!apiBase || !isValidOwnerHandle(handle)) {
    return { kind: "error" };
  }

  const url = new URL(
    `/api/v1/public/owners/${encodeURIComponent(handle)}`,
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
      resolveTimeoutMs
    );

    if (response.status === 404) {
      return { kind: "not-found" };
    }

    if (!response.ok) {
      return { kind: "error" };
    }

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 64 * 1024) {
      return { kind: "error" };
    }

    const envelope = JSON.parse(text) as { data?: Record<string, unknown> };
    const profile = parseEdgeOwnerProfile(envelope.data);

    return profile ? { kind: "ok", profile } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

function parseEdgeOwnerProfile(value: unknown): EdgeOwnerProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;

  if (typeof source.handle !== "string" || typeof source.displayName !== "string") {
    return null;
  }

  const pets = Array.isArray(source.pets) ? source.pets : [];

  return {
    handle: source.handle,
    displayName: source.displayName,
    bio: typeof source.bio === "string" ? source.bio : null,
    avatarUrl: typeof source.avatarUrl === "string" ? source.avatarUrl : null,
    generalArea: typeof source.generalArea === "string" ? source.generalArea : null,
    petNames: pets
      .map((pet) =>
        pet && typeof pet === "object" && typeof (pet as { name?: unknown }).name === "string"
          ? ((pet as { name: string }).name)
          : ""
      )
      .filter(Boolean),
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

export function buildOwnerProfileHead(profile: EdgeOwnerProfile) {
  const name = cleanText(profile.displayName, 60) || "A MyPetLink family";
  const title = `${name} on MyPetLink`;
  const petSummary =
    profile.petNames.length > 0
      ? `Pets: ${profile.petNames.slice(0, 3).join(", ")}`
      : "";
  const description =
    cleanText(profile.bio ?? "", 140) || petSummary || `Follow ${name} on MyPetLink.`;
  const canonical = `${productionSiteOrigin}/u/${profile.handle.toLowerCase()}`;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta name="twitter:card" content="summary">`,
  ];

  if (profile.avatarUrl) {
    tags.push(`<meta property="og:image" content="${escapeHtml(profile.avatarUrl)}">`);
  }

  return tags.join("\n");
}

function ownerHtmlHeaders(source?: Headers) {
  const headers = new Headers(source);
  headers.set("content-type", "text/html; charset=utf-8");
  // A profile can be switched off at any moment; never let an intermediary hold
  // a copy of one.
  headers.set("cache-control", "no-store");
  headers.delete("etag");
  headers.delete("last-modified");
  return headers;
}

function unavailableOwnerResponse(state: "not-found" | "error") {
  const status = state === "not-found" ? 404 : 503;
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>Profile unavailable | MyPetLink</title>`
    + `<meta name="robots" content="noindex">`
    + `</head><body><main><h1>This profile isn't available</h1>`
    + `<p>The link may have changed, or the profile may not be shared right now.</p>`
    + `</main></body></html>`;

  return new Response(body, { headers: ownerHtmlHeaders(), status });
}

/**
 * Serves the static shell with the owner's metadata rewritten into its head.
 *
 * `context.next()` returns the exported `/u/[handle]` page; only the head is
 * replaced, so the React app still boots and fetches the live profile itself.
 */
export async function handleOwnerProfileRequest(
  context: EdgeContext,
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

  // A handle the account used to hold. Answer with a real redirect so old links
  // and anything that stored one keep working, rather than faking it in script.
  if (resolution.kind === "moved") {
    const target = `/u/${resolution.currentHandle.toLowerCase()}`;
    return new Response(null, {
      headers: { location: target, "cache-control": "no-store" },
      status: 301,
    });
  }

  // Canonicalise casing so one profile has exactly one URL.
  if (requested !== handle) {
    return new Response(null, {
      headers: { location: `/u/${handle}`, "cache-control": "no-store" },
      status: 301,
    });
  }

  const profileResult = await fetchOwnerProfile(context.env, handle, fetcher);

  if (profileResult.kind === "not-found") {
    return unavailableOwnerResponse("not-found");
  }

  if (profileResult.kind === "error") {
    return unavailableOwnerResponse("error");
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
  const head = buildOwnerProfileHead(profileResult.profile);
  const rewritten = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    head
  );

  return new Response(rewritten, {
    headers: ownerHtmlHeaders(assetResponse.headers),
    status: 200,
  });
}
