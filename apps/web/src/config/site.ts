// Single source of truth for product / company / footer / metadata strings.
// Use this instead of repeating the product name, company, or support email
// across components and metadata.

export const siteConfig = {
  productName: "MyPetLink",
  companyName: "GBB Software Solutions",
  country: "Malaysia",
  supportEmail: "support@mypetlink.com.my",
  businessRegistrationNo: "202603141718 (AS0515813-P)",
  url: "https://mypetlink.com.my",
} as const;

export type SiteConfig = typeof siteConfig;
