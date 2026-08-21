import type { MomentVisibility } from "@/types";

export function normalizeMomentVisibility(
  visibility: MomentVisibility
): Exclude<MomentVisibility, "Family Only"> {
  return visibility === "Public" ? "Public" : "Private";
}
