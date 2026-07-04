// Absolute public base URL for building shareable links and QR targets.
//
// Strategy (first non-empty wins):
//   1. NEXT_PUBLIC_SITE_URL  - canonical public site (set this in production,
//      e.g. Cloudflare Pages, before building).
//   2. NEXT_PUBLIC_APP_URL   - existing app URL env used in local development.
//   3. window.location.origin - safe browser fallback in local development.
//   4. "" - last-resort empty base so links stay relative rather than pointing
//      at a wrong hardcoded host.
//
// Never hardcode a production URL in code; production must set the env var.

const PROD_PLACEHOLDER_FALLBACK = "https://mypetlink.pages.dev";

function normalizeBase(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  // Drop any trailing slash so `${base}${path}` never doubles up.
  return trimmed.replace(/\/+$/, "");
}

// Env-only base URL (never reads window). Use this for the first render so
// server and client hydrate identically; update to getSiteBaseUrl() in an
// effect afterwards to pick up window.location.origin in local development.
export function getEnvBaseUrl(): string {
  return (
    normalizeBase(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeBase(process.env.NEXT_PUBLIC_APP_URL)
  );
}

// Returns the absolute base URL (no trailing slash) or "" when unknown.
export function getSiteBaseUrl(): string {
  const fromEnv = getEnvBaseUrl();

  if (fromEnv) {
    return fromEnv;
  }

  if (typeof window !== "undefined") {
    return normalizeBase(window.location.origin);
  }

  return "";
}

// Base URL used for static server rendering (before hydration) where there is
// no window. Prefers env; only uses the shared placeholder when nothing is set,
// so pre-render output does not point at a wrong host. The client re-computes
// with the real origin on hydration.
export function getServerFallbackBaseUrl(): string {
  return getSiteBaseUrl() || PROD_PLACEHOLDER_FALLBACK;
}

// Turns a route path (e.g. "/q/CODE") into an absolute URL when a base URL is
// known, otherwise returns the path unchanged so it still works relatively.
export function toAbsoluteUrl(pathOrUrl: string, baseOverride?: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const base = baseOverride ?? getSiteBaseUrl();
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;

  return base ? `${base}${path}` : path;
}
