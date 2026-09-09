import type { BreedEntry } from "@/data/breeds/types";

/** Rabbit breeds recognised by ARBA / the British Rabbit Council. */
export const rabbitBreeds: readonly BreedEntry[] = [
  { value: "American Chinchilla" },
  { value: "American Fuzzy Lop" },
  { value: "Belgian Hare" },
  { value: "Californian" },
  { value: "Champagne d'Argent" },
  { value: "Checkered Giant" },
  { value: "Dutch" },
  { value: "Dwarf Hotot" },
  { value: "English Angora" },
  { value: "English Lop" },
  { value: "English Spot" },
  { value: "Flemish Giant" },
  { value: "Florida White" },
  { value: "French Angora" },
  { value: "French Lop" },
  { value: "Harlequin" },
  { value: "Havana" },
  { value: "Himalayan" },
  { value: "Holland Lop" },
  { value: "Jersey Wooly" },
  { value: "Lionhead" },
  { value: "Mini Lop" },
  { value: "Mini Rex" },
  { value: "Mini Satin" },
  { value: "Netherland Dwarf" },
  { value: "New Zealand" },
  { value: "Polish" },
  { value: "Rex" },
  { value: "Rhinelander" },
  { value: "Satin" },
  { value: "Silver Fox" },
  { value: "Tan" },
];

/**
 * Guinea pig breeds recognised by ARBA / the British Cavy Council. These are
 * genuine breeds distinguished by coat type, not colour morphs.
 */
export const guineaPigBreeds: readonly BreedEntry[] = [
  { value: "Abyssinian" },
  { value: "American" },
  { value: "Baldwin" },
  { value: "Coronet" },
  { value: "Merino" },
  { value: "Peruvian" },
  { value: "Rex" },
  { value: "Silkie", keywords: ["sheltie"] },
  { value: "Skinny Pig", keywords: ["hairless"] },
  { value: "Teddy" },
  { value: "Texel" },
  { value: "White Crested" },
];

/**
 * Hamsters do not have breeds — these are the five distinct species kept as
 * pets. Listed under "breed" because that is the field an owner fills in, and
 * the species they own is the useful answer. Deliberately not padded with
 * colour morphs (golden, banded, satin), which are not types of hamster.
 */
export const hamsterBreeds: readonly BreedEntry[] = [
  { value: "Campbell's Dwarf", keywords: ["campbells", "russian dwarf"] },
  { value: "Chinese" },
  { value: "Roborovski", keywords: ["robo"] },
  { value: "Syrian", keywords: ["golden hamster", "teddy bear hamster"] },
  { value: "Winter White", keywords: ["djungarian", "russian dwarf"] },
];
