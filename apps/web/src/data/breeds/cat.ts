import type { BreedEntry } from "@/data/breeds/types";

/**
 * Cat breeds recognised by the major registries (TICA / CFA / GCCF), plus the
 * shelter coat-length descriptors owners and vets in Malaysia use every day.
 *
 * Same two rules as the dog list: one canonical entry per concept, and nothing
 * invented. "Kucing kampung" is marked below as owner terminology.
 */
export const catBreeds: readonly BreedEntry[] = [
  /**
   * Owner terminology, not a recognised breed. The overwhelming majority of
   * Malaysian pet cats are local domestic mixed cats, and "kucing kampung" is
   * what owners call them. Kept as its own canonical value; "Domestic
   * Shorthair" and the shared "Mixed breed" fallback both remain available.
   */
  {
    value: "Kucing kampung",
    label: "Kucing kampung (Domestic mixed cat)",
    keywords: ["local", "village", "mixed", "domestic", "moggie"],
  },

  { value: "Abyssinian" },
  { value: "American Bobtail" },
  { value: "American Curl" },
  { value: "American Shorthair" },
  { value: "Balinese" },
  { value: "Bengal" },
  { value: "Birman" },
  { value: "Bombay" },
  { value: "British Longhair" },
  { value: "British Shorthair" },
  { value: "Burmese" },
  { value: "Burmilla" },
  { value: "Chartreux" },
  { value: "Cornish Rex" },
  { value: "Devon Rex" },
  /** Coat-length descriptors, not registry breeds — how shelters and vets record mixed cats. */
  { value: "Domestic Longhair", keywords: ["DLH", "long hair"] },
  { value: "Domestic Medium Hair", keywords: ["DMH", "medium hair"] },
  { value: "Domestic Shorthair", keywords: ["DSH", "short hair"] },
  { value: "Egyptian Mau" },
  { value: "Exotic Shorthair" },
  { value: "Havana Brown" },
  { value: "Himalayan" },
  { value: "Japanese Bobtail" },
  { value: "Khao Manee" },
  { value: "Korat" },
  { value: "LaPerm" },
  { value: "Maine Coon" },
  { value: "Manx" },
  { value: "Munchkin" },
  { value: "Nebelung" },
  { value: "Norwegian Forest Cat", keywords: ["wegie"] },
  { value: "Ocicat" },
  { value: "Oriental Longhair" },
  { value: "Oriental Shorthair" },
  { value: "Persian" },
  { value: "Peterbald" },
  { value: "Pixiebob" },
  { value: "Ragamuffin" },
  { value: "Ragdoll" },
  { value: "Russian Blue" },
  { value: "Savannah" },
  { value: "Scottish Fold" },
  { value: "Scottish Straight" },
  { value: "Selkirk Rex" },
  { value: "Siamese" },
  { value: "Siberian" },
  { value: "Singapura" },
  { value: "Snowshoe" },
  { value: "Somali" },
  { value: "Sphynx", keywords: ["hairless"] },
  { value: "Tonkinese" },
  { value: "Toyger" },
  { value: "Turkish Angora" },
  { value: "Turkish Van" },
];
