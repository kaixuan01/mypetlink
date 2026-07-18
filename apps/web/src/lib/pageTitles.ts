import { siteConfig } from "@/config/site";

export const loadingTitle = "Loading";
export const genericNotFoundTitle = "Page not found";
export const petNotFoundTitle = "Pet not found";
export const publicProfileNotFoundTitle = "Pet profile not found";
export const qrSafetyNotFoundTitle = "Safety Profile not found";
export const tagNotFoundTitle = "Tag not found";
export const orderNotFoundTitle = "Order not found";

export type OwnerPetTitleSection =
  | "profile"
  | "edit"
  | "records"
  | "moments"
  | "moment-new"
  | "timeline"
  | "qr"
  | "tags"
  | "tag-order";

export function formatPageTitle(pageTitle: string) {
  const title = pageTitle.trim();

  if (!title) {
    return siteConfig.productName;
  }

  if (title === siteConfig.productName || title.endsWith(`| ${siteConfig.productName}`)) {
    return title;
  }

  return `${title} | ${siteConfig.productName}`;
}

export function setPageTitle(pageTitle: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.title = formatPageTitle(pageTitle);
}

export function setAbsolutePageTitle(pageTitle: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.title = pageTitle.trim() || siteConfig.productName;
}

export function ownerPetPageTitle(
  section: OwnerPetTitleSection,
  petName: string
) {
  switch (section) {
    case "edit":
      return `Edit ${petName}`;
    case "records":
      return `${petName} Care Records`;
    case "moments":
      return `${petName} Memories`;
    case "moment-new":
      return `Add a moment for ${petName}`;
    case "timeline":
      return `${petName} Timeline`;
    case "qr":
      return `${petName} Safety Profile`;
    case "tags":
      return `${petName} Smart Tags`;
    case "tag-order":
      return `Order a tag for ${petName}`;
    case "profile":
    default:
      return petName;
  }
}

export function publicPetProfileDocumentTitle(petName: string) {
  return `${petName} | ${siteConfig.productName} Pet Profile`;
}

export function qrSafetyPageTitle(petName: string) {
  return `${petName} Safety Profile`;
}

export function tagScanPageTitle(petName: string) {
  return `${petName} Tag Scan Page`;
}
