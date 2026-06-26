// One TagCode strategy for MyPetLink physical tags.
// The same TagCode is printed on the tag, encoded in the QR + NFC URL,
// shown to the owner, and searched by support and the manufacturer CSV.
// Format: MPL-XXXX-XXXX (branded, readable, not sequential).

const TAG_CODE_PREFIX = "MPL";

// Excludes characters that are easy to confuse when read off a physical tag:
// no O, 0, I, 1.
const SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TAG_CODE_PATTERN = /^MPL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

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

// Short, stable, URL-safe disambiguator for a public profile path.
// Lives in /p/{slug}-{publicCode} so the same slug can be reused by
// different owners without collisions.
export function generatePublicCode() {
  return randomSegment(4).toLowerCase();
}
