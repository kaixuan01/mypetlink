export const indexableSamplePublicCode = "pnpr4ipnr6ppelnsn";
export const indexableSamplePublicSlug = `topu-${indexableSamplePublicCode}`;
export const indexableSampleSafetyCode = "sl3j2b2q3e2oqhe4iamqa";

// Deletion-proof, public-only content for the marketing sample journey. Keep
// this projection free of owner contact, route identifiers, and private data.
export const staticSampleExperiencePet = {
  name: "Topu",
  species: "Cat",
  bio: "Curious, friendly, and always looking for treats.",
  profilePhotoUrl:
    "https://media.mypetlink.com.my/pets/03241526-0d9e-42fb-9ef5-8bbcbdb424f5/profile/880dee99fa4d44e2ab1ccac3eb31bf85.jpg",
} as const;

// Fallback destinations for the two sample cards when the configured sample is
// unavailable. Both are published routes of this site: they are produced by
// `staticRouteParams` and the Public Share Profile is listed in the sitemap, so
// a visitor always has a working sample to open.
export const staticSampleExperienceDestinations = {
  publicProfilePath: `/p/${indexableSamplePublicSlug}`,
  safetyProfilePath: `/q/${indexableSampleSafetyCode}`,
} as const;
