// Client-side mirrors of the server's social identity rules.
//
// These exist so the form can tell someone their handle is too short before
// they submit it, not to decide anything. The API re-validates every one of
// these rules and is the only thing that grants a handle; hiding or disabling a
// control is a courtesy, never authorization.
//
// Keep in step with:
//   apps/api/MyPetLink.Api/Common/OwnerHandleRules.cs
//   apps/api/MyPetLink.Api/Common/GeneralAreaRules.cs

export const handleMinLength = 3;
export const handleMaxLength = 30;
export const socialDisplayNameMinLength = 2;
export const socialDisplayNameMaxLength = 60;
export const socialBioMaxLength = 300;
export const generalAreaMaxLength = 80;

/** Lower-cases and strips a leading "@". The uniqueness key on the server. */
export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

/** Keeps the owner's capitalisation for display, without a leading "@". */
export function normalizeHandleForDisplay(value: string): string {
  return value.trim().replace(/^@+/, "");
}

/**
 * A validation message for a handle's shape, or null when it looks fine.
 *
 * Deliberately says nothing about whether the handle is taken or reserved: the
 * availability endpoint answers that, and it answers identically for every
 * unavailable reason so it cannot be used to map which handles exist.
 */
export function getHandleShapeError(value: string): string | null {
  const handle = normalizeHandle(value);

  if (!handle) {
    return "Choose a handle.";
  }

  if (handle.length < handleMinLength || handle.length > handleMaxLength) {
    return `Handles are ${handleMinLength} to ${handleMaxLength} characters.`;
  }

  if (!/^[a-z]/.test(handle)) {
    return "Handles start with a letter.";
  }

  if (!/[a-z0-9]$/.test(handle)) {
    return "Handles end with a letter or a number.";
  }

  if (!/^[a-z0-9._]+$/.test(handle)) {
    return "Handles use letters, numbers, underscores and dots.";
  }

  if (/[._]{2}/.test(handle)) {
    return "Handles cannot have two separators in a row.";
  }

  return null;
}

export function getSocialDisplayNameError(value: string): string | null {
  const displayName = collapseToSingleLine(value);

  if (!displayName) {
    return "Choose a display name.";
  }

  if (
    displayName.length < socialDisplayNameMinLength ||
    displayName.length > socialDisplayNameMaxLength
  ) {
    return `Display names are ${socialDisplayNameMinLength} to ${socialDisplayNameMaxLength} characters.`;
  }

  return null;
}

export function getSocialBioError(value: string): string | null {
  if (value.trim().length > socialBioMaxLength) {
    return `Bios are up to ${socialBioMaxLength} characters.`;
  }

  return null;
}

/**
 * Whether a general area looks like a precise residential address.
 *
 * Mirrors `GeneralAreaRules.LooksLikePreciseAddress` in the API so the form can
 * explain the problem inline instead of bouncing a submission. The API
 * re-validates; this is a courtesy, not authorization.
 *
 * Numbers are NORMAL in Malaysian area names — SS2, USJ 9, Section 17, Bandar
 * Kinrara 5 — so a digit alone never triggers this. What is caught is the shape
 * of a precise address: a unit or house number introduced by a keyword, the
 * Malaysian unit-number form, a house number before a street word, or a
 * slash-numbered street reference.
 */
const keywordThenNumber =
  /\b(no|lot|unit|blok|block|apt|apartment|suite|tingkat|floor|level)\b\.?\s*[a-z]?[-\s]?\d/i;

/** "A-12-3", "12-2" — at least two hyphen-joined numeric groups. */
const unitNumberPattern = /\b[a-z]?\d{1,4}-\d{1,4}(-\d{1,4})?\b/i;

/** "12 Jalan ABC" — a number BEFORE a street word. "Jalan Bangsar 2" is fine. */
const numberThenStreetWord =
  /(^|,)\s*\d{1,5}[a-z]?\s+(jalan|jln|lorong|lrg|persiaran|lebuh|lebuhraya|street|st|road|rd|avenue|ave)\b/i;

/** "Jalan Example 2/3" — the slash marks a precise street reference. */
const streetWithSlashedNumber =
  /\b(jalan|jln|lorong|lrg|persiaran|lebuh)\b[^,]*?\d+\s*\/\s*\d/i;

export function collapseToSingleLine(value: string): string {
  // Line breaks and control characters become a single space: a general area
  // and a display name are one line, and a multi-line value is the shape a
  // pasted postal address arrives in.
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikePreciseAddress(value: string): boolean {
  const area = collapseToSingleLine(value);

  if (!area) {
    return false;
  }

  return (
    keywordThenNumber.test(area) ||
    unitNumberPattern.test(area) ||
    numberThenStreetWord.test(area) ||
    streetWithSlashedNumber.test(area)
  );
}

export function getGeneralAreaError(value: string): string | null {
  const area = collapseToSingleLine(value);

  if (!area) {
    return null;
  }

  if (area.length > generalAreaMaxLength) {
    return `Use a general area such as a neighbourhood and city, up to ${generalAreaMaxLength} characters.`;
  }

  if (looksLikePreciseAddress(area)) {
    return "Use a general area such as a neighbourhood and city, not a full street address.";
  }

  return null;
}

/**
 * A friendly starting point for a handle, built from the owner's pet names.
 *
 * Never from the account name or the email. Those are the account and finder
 * identities: a person who put their real name on a lost-pet page did not
 * thereby agree to publish it to a social network, and an email local part is
 * often a real name too.
 */
export function suggestHandlesFromPetNames(petNames: string[]): string[] {
  const cleaned = petNames
    .map((name) => normalizeHandle(name).replace(/[^a-z0-9]/g, ""))
    .filter((name) => name.length >= 2);

  if (cleaned.length === 0) {
    return [];
  }

  const [first, second] = cleaned;
  const candidates = [
    first,
    `${first}family`,
    second ? `${first}and${second}` : "",
    `${first}house`,
  ];

  return candidates
    .filter(Boolean)
    .map((candidate) => candidate.slice(0, handleMaxLength))
    .filter((candidate) => getHandleShapeError(candidate) === null)
    .filter((candidate, index, all) => all.indexOf(candidate) === index);
}

/**
 * A friendly starting point for a display name, again from the pets rather than
 * from the person.
 */
export function suggestSocialDisplayName(petNames: string[]): string {
  const names = petNames.map((name) => name.trim()).filter(Boolean);

  if (names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return `${names[0]}'s Family`;
  }

  return `${names[0]} & ${names[1]}'s Family`;
}
