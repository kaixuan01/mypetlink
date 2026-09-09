import { type BreedEntry, getBreedsForSpecies } from "@/data/breeds";
import type { PetSpecies } from "@/types";

// Centralized, species-aware suggestions for the pet profile form. These are
// starting points only — every field that uses them still accepts custom
// input, and nothing here is ever saved automatically.
//
// Breeds live in src/data/breeds and are joined on here, so adding one means
// editing a single data file rather than this module or any component.

export const MAX_PERSONALITY_TAGS = 5;

export type PetFieldSuggestions = {
  personality: string[];
  foods: string[];
  toys: string[];
  breeds: readonly BreedEntry[];
};

/** Personality, food and toy ideas. Breeds are joined on in getPetSuggestions. */
type PetIdeaSuggestions = Omit<PetFieldSuggestions, "breeds">;

export const genderQuickPicks = ["Male", "Female", "Unknown"] as const;

const genericSuggestions: PetIdeaSuggestions = {
  personality: ["Friendly", "Gentle", "Playful", "Curious", "Calm", "Sweet"],
  foods: ["Favourite treats", "Fresh veggies", "Pellets"],
  toys: ["Soft toy", "Ball", "Tunnel"],
};

const reptileSuggestions: PetIdeaSuggestions = {
  personality: ["Calm", "Chill", "Curious", "Shy", "Bold"],
  foods: ["Leafy greens", "Insects", "Pellets", "Fruit"],
  toys: ["Basking rock", "Hide box", "Climbing branch"],
};

const smallExoticSuggestions: PetIdeaSuggestions = {
  personality: ["Playful", "Curious", "Energetic", "Sweet", "Shy"],
  foods: ["Pellets", "Insects", "Fresh veggies", "Fruit"],
  toys: ["Tunnel", "Hammock", "Chew toy"],
};

/** Rats, mice and gerbils are handled together: same care, same ideas. */
const smallRodentSuggestions: PetIdeaSuggestions = {
  personality: ["Curious", "Clever", "Social", "Gentle", "Busy"],
  foods: ["Seeds", "Pellets", "Fresh veggies", "Fruit"],
  toys: ["Tunnel", "Chew toy", "Climbing rope"],
};

const suggestionsBySpecies: Partial<Record<PetSpecies, PetIdeaSuggestions>> = {
  Dog: {
    personality: [
      "Happy",
      "Smart",
      "Brave",
      "Gentle",
      "Friendly",
      "Loyal",
      "Playful",
      "Energetic",
    ],
    foods: ["Chicken", "Beef treats", "Kibble", "Peanut butter"],
    toys: ["Squeaky ball", "Rope toy", "Frisbee", "Chew bone"],
  },
  Cat: {
    personality: [
      "Calm",
      "Sweet",
      "Shy",
      "Playful",
      "Curious",
      "Cuddly",
      "Independent",
      "Vocal",
    ],
    foods: ["Wet food", "Tuna", "Chicken", "Kibble"],
    toys: ["Feather wand", "Catnip mouse", "Laser pointer", "Cardboard box"],
  },
  Rabbit: {
    personality: ["Gentle", "Curious", "Shy", "Playful", "Calm"],
    foods: ["Hay", "Leafy greens", "Carrots", "Pellets"],
    toys: ["Tunnel", "Chew sticks", "Willow ball"],
  },
  Bird: {
    personality: ["Chatty", "Curious", "Clever", "Social", "Cheeky"],
    foods: ["Seeds", "Millet", "Fruit", "Pellets"],
    toys: ["Swing", "Bell", "Ladder", "Foraging toy"],
  },
  Hamster: {
    personality: ["Curious", "Busy", "Gentle", "Shy", "Speedy"],
    foods: ["Seeds", "Sunflower seeds", "Fresh veggies", "Pellets"],
    toys: ["Exercise wheel", "Tunnel", "Chew toy"],
  },
  "Guinea Pig": {
    personality: ["Gentle", "Social", "Vocal", "Curious", "Calm"],
    foods: ["Hay", "Bell peppers", "Leafy greens", "Pellets"],
    toys: ["Tunnel", "Hidey house", "Chew sticks"],
  },
  Fish: {
    personality: ["Calm", "Active", "Shy", "Bold", "Graceful"],
    foods: ["Flakes", "Pellets", "Bloodworms", "Brine shrimp"],
    toys: ["Aquarium plants", "Cave decoration", "Floating ring"],
  },
  Turtle: reptileSuggestions,
  Tortoise: reptileSuggestions,
  Reptile: reptileSuggestions,
  Snake: {
    ...reptileSuggestions,
    foods: ["Frozen-thawed mice", "Insects"],
    toys: ["Hide box", "Climbing branch", "Water bowl"],
  },
  Lizard: reptileSuggestions,
  Ferret: smallExoticSuggestions,
  Hedgehog: smallExoticSuggestions,
  "Sugar Glider": smallExoticSuggestions,
  Chinchilla: {
    ...smallExoticSuggestions,
    foods: ["Hay", "Pellets", "Rose hips"],
    toys: ["Dust bath", "Chew sticks", "Tunnel"],
  },
  Rat: smallRodentSuggestions,
  Mouse: smallRodentSuggestions,
  Gerbil: {
    ...smallRodentSuggestions,
    toys: ["Sand bath", "Tunnel", "Chew toy"],
  },
  Horse: {
    personality: ["Gentle", "Calm", "Proud", "Friendly", "Spirited"],
    foods: ["Hay", "Apples", "Carrots", "Oats"],
    toys: ["Jolly ball", "Salt lick", "Treat ball"],
  },
};

// Species-aware lookup with a friendly generic fallback for "Other" and any
// uncommon type that has no dedicated entry. Breeds always come from the
// registry, so a species with no breed data simply gets an empty list and the
// picker falls back to Mixed breed / Unknown / Other.
export function getPetSuggestions(species: PetSpecies): PetFieldSuggestions {
  return {
    ...(suggestionsBySpecies[species] ?? genericSuggestions),
    breeds: getBreedsForSpecies(species),
  };
}

// Short bio starters personalized with the pet's name. Fill-in only — the
// owner can edit or clear them freely.
export function getBioTemplates(petName: string) {
  const name = petName.trim() || "My pet";

  return [
    `${name} is a gentle, snack-loving companion who is happiest around family.`,
    `${name} loves naps, treats, and quiet cuddles in the evening.`,
    `${name} is full of energy and always ready for playtime and new adventures.`,
  ];
}
