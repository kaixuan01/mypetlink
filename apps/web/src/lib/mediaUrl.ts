// Single source of truth for turning a media value from the API into a src the
// browser can safely load. The backend already returns ready-to-render absolute
// public URLs (https://media.mypetlink.com.my/...), so in practice this passes
// those straight through. Its real job is to guarantee we never hand an <img> a
// relative or bucket-prefixed value: a plain relative string would be resolved
// against the current page (e.g. mypetlink.com.my/pets/{id}/...) and request the
// wrong host. Every component that renders R2 media resolves through here.

const PUBLIC_MEDIA_BASE_URL = (
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? ""
).trim();

// Bucket names must never appear inside a public media path. If a stored value
// ever leaks one in (legacy data), strip it before joining with the base URL.
const BUCKET_PREFIXES = ["mypetlink-public-media/", "mypetlink-private-files/"];

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isInlinePreview(value: string) {
  // Local, in-browser previews created before/without an upload.
  return /^(data:|blob:)/i.test(value);
}

function stripBucketPrefix(objectKey: string) {
  let key = objectKey.replace(/^\/+/, "");

  for (const prefix of BUCKET_PREFIXES) {
    if (key.toLowerCase().startsWith(prefix)) {
      key = key.slice(prefix.length);
      break;
    }
  }

  return key;
}

/**
 * Resolve a media value to a safe, absolute src, or "" when it cannot be
 * rendered. Callers should treat "" as "no image" and fall back to a placeholder.
 */
export function resolveMediaUrl(value?: string | null): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  // Already renderable: absolute media URL or a local preview.
  if (isAbsoluteHttpUrl(trimmed) || isInlinePreview(trimmed)) {
    return trimmed;
  }

  // A bare object key. Only ever turn it into an absolute URL against a
  // configured media base. Never emit a relative value, which the browser would
  // request from the frontend origin.
  if (PUBLIC_MEDIA_BASE_URL && isAbsoluteHttpUrl(PUBLIC_MEDIA_BASE_URL)) {
    const base = PUBLIC_MEDIA_BASE_URL.replace(/\/+$/, "");
    const key = stripBucketPrefix(trimmed);
    return key ? `${base}/${key}` : "";
  }

  return "";
}
