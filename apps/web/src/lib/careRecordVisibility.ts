import type { CareRecord } from "@/types";

export type CareRecordAudience = "Private" | "Public";

export function normalizeCareRecordVisibility(
  visibility?: CareRecord["publicVisibility"] | null
): CareRecord["publicVisibility"] {
  return visibility === "Private" ? "Private" : "Public badge only";
}

export function toCareRecordAudience(
  visibility?: CareRecord["publicVisibility"] | null
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
