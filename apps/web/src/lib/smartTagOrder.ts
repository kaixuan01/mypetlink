import { getActivePets } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import type { Pet } from "@/types";

export function getEligibleSmartTagOrderPets(pets: Pet[]) {
  return getActivePets(pets);
}

export function resolveSmartTagOrderContinuation(value?: string | null) {
  return value === ownerRoutes.tagOrder() ? ownerRoutes.tagOrder() : null;
}

export function getPreferredSmartTagOrderPetId(url: string) {
  try {
    const params = new URL(url, "https://mypetlink.local").searchParams;
    return params.get("petId") ?? params.get("pet") ?? "";
  } catch {
    return "";
  }
}
