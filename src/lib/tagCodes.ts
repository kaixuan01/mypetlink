// One TagCode strategy for MyPetLink physical tags.
// The same TagCode is printed on the tag, encoded in the QR + NFC URL,
// shown to the owner, and searched by support and the manufacturer CSV.
// Format: MPL-XXXX-XXXX (branded, readable, not sequential).

const TAG_CODE_PREFIX = "MPL";

// Excludes characters that are easy to confuse when read off a physical tag:
// no O, 0, I, 1.
const SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TAG_CODE_PATTERN = /^MPL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

const LEGACY_TAG_CODE_ALIASES: Record<string, string> = {
  "8kx29a": "MPL-9F3K-H7Q2",
};

function randomSegment(length: number) {
  let segment = "";

  for (let index = 0; index < length; index += 1) {
    segment += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }

  return segment;
}

export function generateTagCode() {
  return `${TAG_CODE_PREFIX}-${randomSegment(4)}-${randomSegment(4)}`;
}

export function isTagCode(value: string) {
  return TAG_CODE_PATTERN.test(value.trim().toUpperCase());
}

export function resolveTagCodeAlias(value: string) {
  const normalized = value.trim();
  return LEGACY_TAG_CODE_ALIASES[normalized.toLowerCase()] ?? normalized;
}

export function getStaticTagCodeParamVariants(tagCode: string) {
  const aliases = Object.entries(LEGACY_TAG_CODE_ALIASES)
    .filter(([, canonical]) => canonical.toLowerCase() === tagCode.toLowerCase())
    .flatMap(([alias]) => [alias.toUpperCase(), alias.toLowerCase()]);

  return Array.from(new Set([tagCode, tagCode.toLowerCase(), ...aliases]));
}

// Short, stable, URL-safe disambiguator for a public profile path.
// Lives in /p/{slug}-{publicCode} so the same slug can be reused by
// different owners without collisions.
export function generatePublicCode() {
  return randomSegment(4).toLowerCase();
}

// Deterministic publicCode fallback derived from a stable seed (the pet id).
// Used so a pet that was stored before publicCode existed always resolves to
// the SAME public profile path on every read — never a value that drifts and
// breaks the statically-exported route.
export function derivePublicCode(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";

  for (let index = 0; index < 4; index += 1) {
    code += chars[hash % chars.length];
    hash = Math.floor(hash / chars.length);
  }

  return code;
}
