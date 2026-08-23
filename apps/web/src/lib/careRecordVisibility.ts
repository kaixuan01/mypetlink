import type { CareRecord } from "@/types";

export type CareRecordAudience = "Private" | "Public";
type CareRecordVisibilityInput =
  | CareRecord["publicVisibility"]
  | "PublicBadgeOnly"
  | "PublicDetails"
  | null
  | undefined;

export function normalizeCareRecordVisibility(
  visibility?: CareRecordVisibilityInput
): CareRecord["publicVisibility"] {
  switch (visibility) {
    case "Public badge only":
    case "Public details":
    case "PublicBadgeOnly":
    case "PublicDetails":
      return "Public badge only";
    default:
      return "Private";
  }
}

export function isCareRecordPublic(
  visibility?: CareRecordVisibilityInput
) {
  return normalizeCareRecordVisibility(visibility) === "Public badge only";
}

export function toCareRecordAudience(
  visibility?: CareRecordVisibilityInput
): CareRecordAudience {
  return normalizeCareRecordVisibility(visibility) === "Private"
    ? "Private"
    : "Public";
}

export function fromCareRecordAudience(
  audience: CareRecordAudience
): CareRecord["publicVisibility"] {
  return audience === "Public" ? "Public badge only" : "Private";
}
