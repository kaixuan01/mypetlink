import { indexableSamplePublicCode } from "../src/data/publicSample";

export const productionSiteOrigin = "https://mypetlink.com.my";
export const socialCardCacheControl =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

const profileFetchTimeoutMs = 8_000;
const cardFetchTimeoutMs = 12_000;
const maxProfileResponseBytes = 64 * 1024;
const maxSocialCardBytes = 1024 * 1024;

export type EdgePublicProfile = {
  publicCode: string;
  publicSlug: string;
  publicProfileVersion: string;
  name: string;
  species: string;
  customSpecies?: string | null;
  breed?: string | null;
  ageDisplayLabel: string;
  lifecycleStatus: "Active" | "Memorial";
  lostModeEnabled: boolean;
  profilePhotoUrl?: string | null;
  coverPhotoUrl?: string | null;
  coverPositionX: number;
  coverPositionY: number;
};

export type PublicProfileFetchResult =
  | { kind: "ok"; profile: EdgePublicProfile }
  | { kind: "not-found" }
  | { kind: "error" };

type EdgeContext = EventContext<MyPetLinkPagesEnv, "slug", Record<string, unknown>>;
type FetchLike = typeof fetch;

type SocialCardPayload = {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  etag: string;
  version: string;
};

const socialCardInflight = new Map<string, Promise<SocialCardPayload>>();

export async function handlePublicProfileRequest(
  context: EdgeContext,
  dependencies: { fetch?: FetchLike } = {}
) {
  const slug = getSingleParam(context.params.slug);
  if (!isValidPublicProfileSlug(slug)) {
    return createUnavailableProfileResponse("not-found");
  }

  const profileResult = await fetchPublicSocialProfile(
    context.env,
    slug,
    dependencies.fetch ?? fetch
  );
  if (profileResult.kind === "not-found") {
    return createUnavailableProfileResponse("not-found");
  }
  if (profileResult.kind === "error") {
    return createOperationalApiFallbackResponse(context);
  }

  if (context.request.method === "HEAD") {
    return new Response(null, {
      headers: profileHtmlHeaders(),
      status: 200,
    });
  }

  const assetResponse = await getAssetHtmlResponse(context);
  if (!assetResponse) {
    return createUnavailableProfileResponse("error");
  }

  const metadata = buildPublicProfileHead(profileResult.profile);
  const headers = profileHtmlHeaders(assetResponse.headers);
  return rewriteProfileHead(assetResponse, metadata, headers);
}

async function createOperationalApiFallbackResponse(context: EdgeContext) {
  const assetResponse = await getAssetHtmlResponse(context);
  if (!assetResponse) {
    return createUnavailableProfileResponse("error");
  }

  const headers = profileHtmlHeaders(assetResponse.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-MyPetLink-Metadata", "generic-api-fallback");
  return rewriteProfileHead(
    assetResponse,
    buildUnavailableProfileHead("error"),
    headers
  );
}

function rewriteProfileHead(
  assetResponse: Response,
  metadata: string,
  headers: Headers
) {
  const htmlResponse = new Response(assetResponse.body, {
    headers,
    status: 200,
    statusText: "OK",
  });
  const remove = {
    element(element: Element) {
      element.remove();
    },
  };
  const rewriter = new HTMLRewriter()
    .on("title", remove)
    .on('meta[name="description"]', remove)
    .on('meta[name="robots"]', remove)
    .on('meta[name="googlebot"]', remove)
    .on('link[rel="canonical"]', remove)
    .on('meta[property^="og:"]', remove)
    .on('meta[name^="twitter:"]', remove)
    .on("head", {
      element(element) {
        element.prepend(metadata, { html: true });
      },
    });

  return rewriter.transform(htmlResponse);
}

async function getAssetHtmlResponse(context: EdgeContext) {
  const assetHeaders = new Headers(context.request.headers);
  assetHeaders.delete("if-modified-since");
  assetHeaders.delete("if-none-match");
  assetHeaders.delete("range");
  const response = await context.next(
    new Request(context.request, { headers: assetHeaders })
  );
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("text/html") && response.body
    ? response
    : null;
}

export async function handleSocialCardRequest(
  context: EdgeContext,
  dependencies: { cache?: Cache; fetch?: FetchLike } = {}
) {
  const rawParam = getSingleParam(context.params.slug);
  if (!rawParam.toLowerCase().endsWith(".jpg")) {
    return notFoundImageResponse();
  }

  const slug = rawParam.slice(0, -4);
  if (!isValidPublicProfileSlug(slug)) {
    return notFoundImageResponse();
  }

  // Revalidate the restricted public projection before reading the image cache.
  // This makes an archived/private profile unavailable immediately even if an
  // older versioned JPEG still exists in a Cloudflare cache.
  const fetcher = dependencies.fetch ?? fetch;
  const profileResult = await fetchPublicSocialProfile(context.env, slug, fetcher);
  if (profileResult.kind === "not-found") {
    return notFoundImageResponse();
  }
  if (profileResult.kind === "error") {
    return new Response("Social card temporarily unavailable.", {
      headers: { "Cache-Control": "no-store" },
      status: 503,
    });
  }

  const { profile } = profileResult;
  const currentSlug = profile.publicSlug;
  const cacheUrl = `${productionSiteOrigin}/social/pets/${encodeURIComponent(currentSlug)}.jpg?v=${encodeURIComponent(profile.publicProfileVersion)}`;
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const cache = dependencies.cache ?? caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    return withCardResponseHeaders(cached, profile.publicProfileVersion, "HIT");
  }

  const inflightKey = `${currentSlug}:${profile.publicProfileVersion}`;
  let generation = socialCardInflight.get(inflightKey);
  if (!generation) {
    generation = fetchSocialCardFromApi(context.env, profile, fetcher);
    socialCardInflight.set(inflightKey, generation);
  }

  try {
    const payload = await generation;
    const cacheResponse = payloadToResponse(payload, "MISS");
    context.waitUntil(cache.put(cacheKey, cacheResponse.clone()));
    return cacheResponse;
  } catch (error) {
    console.error("MyPetLink social-card proxy failed.", safeErrorMessage(error));
    return new Response("Social card temporarily unavailable.", {
      headers: { "Cache-Control": "no-store" },
      status: 503,
    });
  } finally {
    if (socialCardInflight.get(inflightKey) === generation) {
      socialCardInflight.delete(inflightKey);
    }
  }
}

export async function fetchPublicSocialProfile(
  env: MyPetLinkPagesEnv,
  slug: string,
  fetcher: FetchLike = fetch
): Promise<PublicProfileFetchResult> {
  const apiBase = getPublicApiBaseUrl(env);
  if (!apiBase || !isValidPublicProfileSlug(slug)) {
    return { kind: "error" };
  }

  const url = new URL(
    `/api/v1/public/pets/${encodeURIComponent(slug)}/social`,
    `${apiBase}/`
  );

  try {
    const response = await fetchWithTimeout(
      fetcher,
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "MyPetLink-Cloudflare-Social/1.0",
        },
      },
      profileFetchTimeoutMs
    );
    if (response.status === 404) {
      return { kind: "not-found" };
    }
    if (!response.ok) {
      return { kind: "error" };
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxProfileResponseBytes) {
      return { kind: "error" };
    }

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxProfileResponseBytes) {
      return { kind: "error" };
    }

    const envelope = JSON.parse(text) as { data?: unknown };
    const profile = parseEdgePublicProfile(envelope.data);
    return profile ? { kind: "ok", profile } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export function buildPublicProfileHead(profile: EdgePublicProfile) {
  const name = cleanMetadataText(profile.name, 80) || "Pet";
  const title = `Meet ${name} | MyPetLink`;
  const pageDescription = `View ${name}'s owner-approved pet profile, memories and safety information on MyPetLink.`;
  const openGraphDescription = `View ${name}'s owner-approved pet profile, memories and safety information.`;
  const twitterDescription = `View ${name}'s owner-approved pet profile on MyPetLink.`;
  const canonical = `${productionSiteOrigin}/p/${encodeURIComponent(profile.publicSlug)}`;
  const socialImage = `${productionSiteOrigin}/social/pets/${encodeURIComponent(profile.publicSlug)}.jpg?v=${encodeURIComponent(profile.publicProfileVersion)}`;
  const imageAlt = `${name}'s profile on MyPetLink`;
  const robots = profile.publicCode.toLowerCase() === indexableSamplePublicCode
    ? "index,follow"
    : "noindex,follow";

  return [
    `<title>${escapeHtmlText(title)}</title>`,
    meta("name", "description", pageDescription),
    meta("name", "robots", robots),
    meta("name", "googlebot", robots),
    `<link rel="canonical" href="${escapeHtmlAttribute(canonical)}">`,
    meta("property", "og:title", title),
    meta("property", "og:description", openGraphDescription),
    meta("property", "og:type", "website"),
    meta("property", "og:url", canonical),
    meta("property", "og:image", socialImage),
    meta("property", "og:image:secure_url", socialImage),
    meta("property", "og:image:type", "image/jpeg"),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", imageAlt),
    meta("property", "og:site_name", "MyPetLink"),
    meta("property", "og:locale", "en_MY"),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", twitterDescription),
    meta("name", "twitter:image", socialImage),
    meta("name", "twitter:image:alt", imageAlt),
  ].join("");
}

export function isValidPublicProfileSlug(value: string) {
  if (value.length < 5 || value.length > 160) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(value)) return false;
  const publicCode = value.slice(value.lastIndexOf("-") + 1);
  return publicCode.length >= 4 && publicCode.length <= 64;
}

export function getPublicApiBaseUrl(env: MyPetLinkPagesEnv) {
  const raw = (env.PUBLIC_API_BASE_URL ?? env.NEXT_PUBLIC_API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function parseEdgePublicProfile(value: unknown): EdgePublicProfile | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const publicCode = stringValue(item.publicCode, 64);
  const publicSlug = stringValue(item.publicSlug, 160);
  const publicProfileVersion = stringValue(item.publicProfileVersion, 64);
  const name = stringValue(item.name, 120);
  const species = stringValue(item.species, 80);
  const lifecycleStatus = item.lifecycleStatus;
  if (
    !publicCode ||
    !publicSlug ||
    !isValidPublicProfileSlug(publicSlug) ||
    !publicProfileVersion ||
    !/^[a-f0-9]{16,64}$/i.test(publicProfileVersion) ||
    !name ||
    !species ||
    (lifecycleStatus !== "Active" && lifecycleStatus !== "Memorial")
  ) {
    return null;
  }

  return {
    publicCode,
    publicSlug: publicSlug.toLowerCase(),
    publicProfileVersion: publicProfileVersion.toLowerCase(),
    name,
    species,
    customSpecies: optionalString(item.customSpecies, 80),
    breed: optionalString(item.breed, 120),
    ageDisplayLabel: optionalString(item.ageDisplayLabel, 80) ?? "",
    lifecycleStatus,
    lostModeEnabled: item.lostModeEnabled === true,
    profilePhotoUrl: optionalString(item.profilePhotoUrl, 2048),
    coverPhotoUrl: optionalString(item.coverPhotoUrl, 2048),
    coverPositionX: boundedNumber(item.coverPositionX, 50),
    coverPositionY: boundedNumber(item.coverPositionY, 50),
  };
}

async function fetchSocialCardFromApi(
  env: MyPetLinkPagesEnv,
  profile: EdgePublicProfile,
  fetcher: FetchLike
): Promise<SocialCardPayload> {
  const apiBase = getPublicApiBaseUrl(env);
  if (!apiBase) throw new Error("Public API base URL is not configured.");
  const url = new URL(
    `/api/v1/public/pets/${encodeURIComponent(profile.publicSlug)}/social-card.jpg`,
    `${apiBase}/`
  );
  url.searchParams.set("v", profile.publicProfileVersion);

  const response = await fetchWithTimeout(
    fetcher,
    url,
    {
      headers: {
        Accept: "image/jpeg",
        "User-Agent": "MyPetLink-Cloudflare-Social/1.0",
      },
      // Cloudflare's edge fetch does not implement redirect="error". Manual
      // mode plus the response.ok check below rejects every redirect without
      // following it to an untrusted destination.
      redirect: "manual",
    },
    cardFetchTimeoutMs
  );
  if (!response.ok) throw new Error("Social-card origin returned an error.");

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .toLowerCase();
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (contentType !== "image/jpeg" || declaredLength > maxSocialCardBytes) {
    throw new Error("Social-card origin returned an invalid image.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength < 4 ||
    bytes.byteLength > maxSocialCardBytes ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  ) {
    throw new Error("Social-card origin returned invalid JPEG bytes.");
  }

  return {
    bytes,
    contentType: "image/jpeg",
    etag: `"${profile.publicProfileVersion}"`,
    version: profile.publicProfileVersion,
  };
}

function payloadToResponse(payload: SocialCardPayload, cacheStatus: "HIT" | "MISS") {
  const body = payload.bytes.buffer.slice(
    payload.bytes.byteOffset,
    payload.bytes.byteOffset + payload.bytes.byteLength
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Cache-Control": socialCardCacheControl,
      "Content-Type": payload.contentType,
      ETag: payload.etag,
      "X-Public-Profile-Version": payload.version,
      "X-Social-Card-Cache": cacheStatus,
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}

function withCardResponseHeaders(
  response: Response,
  version: string,
  cacheStatus: "HIT" | "MISS"
) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", socialCardCacheControl);
  headers.set("Content-Type", "image/jpeg");
  headers.set("ETag", `"${version}"`);
  headers.set("X-Public-Profile-Version", version);
  headers.set("X-Social-Card-Cache", cacheStatus);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { headers, status: 200 });
}

function createUnavailableProfileResponse(state: "not-found" | "error") {
  const status = state === "not-found" ? 404 : 503;
  const heading = state === "not-found"
    ? "This pet profile is unavailable"
    : "This pet profile is temporarily unavailable";
  const description = unavailableDescription(state);
  const head = buildUnavailableProfileHead(state);

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<style>body{margin:0;background:#fff8e8;color:#102247;font-family:Arial,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{max-width:560px;background:white;border:1px solid #eadfca;border-radius:32px;padding:40px;text-align:center;box-shadow:0 18px 50px rgba(16,34,71,.12)}h1{font-size:30px;margin:16px 0 10px}p{color:#53627f;line-height:1.6}a{display:inline-block;margin-top:18px;background:#1570ef;color:white;text-decoration:none;border-radius:999px;padding:13px 22px;font-weight:800}.brand{font-size:25px;font-weight:900}</style></head><body><main class="wrap"><section class="card"><div class="brand">MyPetLink</div><h1>${escapeHtmlText(heading)}</h1><p>${escapeHtmlText(description)}</p><a href="${productionSiteOrigin}/">Back to MyPetLink</a></section></main></body></html>`,
    {
      headers: {
        "Cache-Control": state === "not-found" ? "public, max-age=60" : "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Content-Type-Options": "nosniff",
      },
      status,
    }
  );
}

export function buildUnavailableProfileHead(state: "not-found" | "error") {
  const title = state === "not-found"
    ? "Pet Profile Unavailable | MyPetLink"
    : "Pet Profile Temporarily Unavailable | MyPetLink";
  const description = unavailableDescription(state);
  const canonical = `${productionSiteOrigin}/pet-profile`;
  const genericImage = `${productionSiteOrigin}/og-image.png`;
  return [
    `<title>${escapeHtmlText(title)}</title>`,
    meta("name", "description", description),
    meta("name", "robots", "noindex,follow"),
    meta("name", "googlebot", "noindex,follow"),
    `<link rel="canonical" href="${canonical}">`,
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:type", "website"),
    meta("property", "og:url", canonical),
    meta("property", "og:image", genericImage),
    meta("property", "og:site_name", "MyPetLink"),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", genericImage),
  ].join("");
}

function unavailableDescription(state: "not-found" | "error") {
  return state === "not-found"
    ? "This MyPetLink pet profile is unavailable or is not shared publicly."
    : "We could not load this MyPetLink pet profile right now. Please try again shortly.";
}

function notFoundImageResponse() {
  return new Response("Social card not found.", {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
    status: 404,
  });
}

function profileHtmlHeaders(source?: Headers) {
  const headers = new Headers(source);
  headers.delete("accept-ranges");
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("last-modified");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-MyPetLink-Metadata", "dynamic-public-profile");
  return headers;
}

async function fetchWithTimeout(
  fetcher: FetchLike,
  input: URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function meta(attribute: "name" | "property", key: string, content: string) {
  return `<meta ${attribute}="${escapeHtmlAttribute(key)}" content="${escapeHtmlAttribute(content)}">`;
}

function escapeHtmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanMetadataText(value: string, maxLength: number) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? cleanMetadataText(value, maxLength) : "";
}

function optionalString(value: unknown, maxLength: number) {
  const result = stringValue(value, maxLength);
  return result || null;
}

function boundedNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : fallback;
}

function getSingleParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`.slice(0, 300)
    : "Unknown social-card proxy error";
}
