import { birdBreeds, fishBreeds } from "@/data/breeds/birdFish";
import { catBreeds } from "@/data/breeds/cat";
import { dogBreeds } from "@/data/breeds/dog";
import {
  guineaPigBreeds,
  hamsterBreeds,
  rabbitBreeds,
} from "@/data/breeds/smallPets";
import type { BreedEntry } from "@/data/breeds/types";
import type { PetSpecies } from "@/types";

export type { BreedEntry } from "@/data/breeds/types";

/**
 * Every breed choice MyPetLink offers, keyed by species.
 *
 * Adding or correcting a breed means editing one data file and nothing else —
 * the picker, the suggestions API and the form all read through here.
 *
 * A species is absent from this map when no reliable list exists for it. That
 * is a deliberate answer, not a gap to fill later:
 *
 * - **Reptile, Snake, Lizard, Turtle, Tortoise** — owners keep hundreds of
 *   distinct species, and what the trade calls a "breed" is usually a colour
 *   morph of one species. A short list would be arbitrary and a long one would
 *   be unreliable.
 * - **Ferret, Hedgehog, Sugar Glider, Chinchilla** — these have colour and
 *   pattern morphs, not breeds.
 * - **Rat, Mouse, Gerbil** — fancy varieties describe coat and ear type rather
 *   than breed, and are not consistently named between breeders.
 * - **Horse** — real breeds exist, but equine ownership is far outside what
 *   this product serves; a list here would be noise.
 * - **Other** — the species itself is already free text.
 *
 * For all of these the picker still offers Mixed breed, Unknown and Other, and
 * an owner can always type their own value.
 */
const breedsBySpecies: Partial<Record<PetSpecies, readonly BreedEntry[]>> = {
  Dog: dogBreeds,
  Cat: catBreeds,
  Rabbit: rabbitBreeds,
  "Guinea Pig": guineaPigBreeds,
  Hamster: hamsterBreeds,
  Bird: birdBreeds,
  Fish: fishBreeds,
};

/** Offered for every species, whatever its breed data. Order is intentional. */
export const FALLBACK_BREEDS: readonly BreedEntry[] = [
  {
    value: "Mixed breed",
    keywords: ["mix", "crossbreed", "mongrel"],
  },
  { value: "Unknown", keywords: ["not sure", "don't know"] },
];

/**
 * The label the picker uses for the free-text escape hatch. Never stored —
 * choosing it opens a text field and whatever the owner types is stored
 * instead.
 */
export const CUSTOM_BREED_OPTION = "Other";

export function getBreedsForSpecies(species: PetSpecies): readonly BreedEntry[] {
  return breedsBySpecies[species] ?? [];
}

/** Whether a stored breed is one this species suggests. Case-insensitive. */
export function isKnownBreedForSpecies(species: PetSpecies, breed: string) {
  const candidate = breed.trim().toLocaleLowerCase();
  if (!candidate) return true;

  return [...getBreedsForSpecies(species), ...FALLBACK_BREEDS].some(
    (entry) => entry.value.toLocaleLowerCase() === candidate
  );
}
