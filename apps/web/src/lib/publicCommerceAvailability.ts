import { smartTagPurchaseEnabled } from "@/lib/features";

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

// Build-time purchase availability only. PartnerStoresDirectory resolves opted-in
// physical stores at runtime; no merchant content is embedded in the export.
const publicRetailPartners: readonly PublicRetailPartner[] = [];

export const publicCommerceAvailability =
  resolvePublicCommerceAvailability({
    onlineOrderingAvailable: smartTagPurchaseEnabled,
    publicRetailPartners,
  });
