import type { BreedEntry } from "@/data/breeds/types";

/**
 * Companion birds kept in Malaysia. These are species and species groups, not
 * breeds — a bird owner asked for "breed" means the kind of bird, so that is
 * what this offers. Colour mutations (lutino, albino, pied) are deliberately
 * excluded: they describe an individual bird, not its kind.
 */
export const birdBreeds: readonly BreedEntry[] = [
  { value: "African Grey Parrot", keywords: ["african grey"] },
  { value: "Amazon Parrot" },
  { value: "Budgerigar", keywords: ["budgie", "parakeet"] },
  { value: "Caique" },
  { value: "Canary" },
  { value: "Cockatiel" },
  { value: "Cockatoo" },
  { value: "Conure", keywords: ["sun conure", "green cheek"] },
  { value: "Eclectus Parrot" },
  { value: "Gouldian Finch" },
  { value: "Java Sparrow", keywords: ["java"] },
  { value: "Lorikeet", keywords: ["lory"] },
  { value: "Lovebird" },
  { value: "Macaw" },
  { value: "Mynah", keywords: ["myna", "tiong"] },
  { value: "Parrotlet" },
  { value: "Pigeon", keywords: ["dove"] },
  { value: "Quaker Parrot", keywords: ["monk parakeet"] },
  { value: "Ringneck Parakeet", keywords: ["indian ringneck", "IRN"] },
  { value: "Senegal Parrot" },
  { value: "Society Finch" },
  { value: "White-eye", keywords: ["mata puteh", "zosterops"] },
  { value: "Zebra Dove", keywords: ["merbok"] },
  { value: "Zebra Finch" },
];

/**
 * Common aquarium and pond fish kept in Malaysia. Like birds, these are
 * species and trade groups rather than breeds. Kept at the level an owner
 * would actually recognise — "Cichlid" rather than several hundred individual
 * cichlid species, and no colour or fin-type variants.
 */
export const fishBreeds: readonly BreedEntry[] = [
  { value: "Angelfish" },
  { value: "Arowana", keywords: ["dragon fish", "kelisa"] },
  { value: "Betta", keywords: ["siamese fighting fish", "ikan laga"] },
  { value: "Cardinal Tetra" },
  { value: "Cichlid", keywords: ["african cichlid", "malawi"] },
  { value: "Clownfish" },
  { value: "Corydoras", keywords: ["cory catfish"] },
  { value: "Discus" },
  { value: "Flowerhorn" },
  { value: "Goldfish" },
  { value: "Gourami" },
  { value: "Guppy" },
  { value: "Killifish" },
  { value: "Koi" },
  { value: "Loach" },
  { value: "Molly" },
  { value: "Neon Tetra" },
  { value: "Oscar" },
  { value: "Platy" },
  { value: "Plecostomus", keywords: ["pleco", "sucker fish"] },
  { value: "Rainbowfish" },
  { value: "Rasbora" },
  { value: "Swordtail" },
  { value: "Tiger Barb" },
  { value: "Zebra Danio" },
];
