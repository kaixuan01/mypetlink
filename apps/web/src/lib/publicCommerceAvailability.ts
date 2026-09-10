import { smartTagOrderingEnabled } from "@/lib/features";

export type PublicRetailPartner = {
  name: string;
  state: string;
  area: string;
  branch?: string;
  authorised: boolean;
};

export type PublicCommerceAvailabilityInput = {
  onlineOrderingAvailable: boolean;
  publicRetailPartners: readonly PublicRetailPartner[];
};

export function resolvePublicCommerceAvailability({
  onlineOrderingAvailable,
  publicRetailPartners,
}: PublicCommerceAvailabilityInput) {
  const hasPublicRetailPartners = publicRetailPartners.length > 0;

  return Object.freeze({
    onlineOrderingAvailable,
    publicRetailPartners,
    hasPublicRetailPartners,
    showWhereToBuy: onlineOrderingAvailable || hasPublicRetailPartners,
  });
}

// There is no supported public retail-partner source yet. This empty input is
// deliberately colocated with the visibility rule rather than represented by
// a second boolean that could drift from future partner data. When a real
// public partner projection exists, pass that collection here; the visibility
// rule and all of its consumers remain unchanged.
const publicRetailPartners: readonly PublicRetailPartner[] = [];

export const publicCommerceAvailability =
  resolvePublicCommerceAvailability({
    onlineOrderingAvailable: smartTagOrderingEnabled,
    publicRetailPartners,
  });
