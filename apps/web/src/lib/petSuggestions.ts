import type { PetSpecies } from "@/types";

// Centralized, species-aware suggestions for the pet profile form. These are
// starting points only — every field that uses them still accepts custom
// input, and nothing here is ever saved automatically.

export const MAX_PERSONALITY_TAGS = 5;

export type PetFieldSuggestions = {
  personality: string[];
  foods: string[];
  toys: string[];
  breeds: string[];
};

export const genderQuickPicks = ["Male", "Female", "Unknown"] as const;

const genericSuggestions: PetFieldSuggestions = {
  personality: ["Friendly", "Gentle", "Playful", "Curious", "Calm", "Sweet"],
  foods: ["Favourite treats", "Fresh veggies", "Pellets"],
  toys: ["Soft toy", "Ball", "Tunnel"],
  breeds: [],
};

const reptileSuggestions: PetFieldSuggestions = {
  personality: ["Calm", "Chill", "Curious", "Shy", "Bold"],
  foods: ["Leafy greens", "Insects", "Pellets", "Fruit"],
  toys: ["Basking rock", "Hide box", "Climbing branch"],
  breeds: [],
};

const smallExoticSuggestions: PetFieldSuggestions = {
  personality: ["Playful", "Curious", "Energetic", "Sweet", "Shy"],
  foods: ["Pellets", "Insects", "Fresh veggies", "Fruit"],
  toys: ["Tunnel", "Hammock", "Chew toy"],
  breeds: [],
};

const suggestionsBySpecies: Partial<Record<PetSpecies, PetFieldSuggestions>> = {
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
    breeds: [
      "Mixed breed",
      "Poodle",
      "Shih Tzu",
      "Golden Retriever",
      "Labrador Retriever",
      "Corgi",
      "Pomeranian",
      "German Shepherd",
      "Husky",
      "Chihuahua",
    ],
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
    breeds: [
      "Domestic Shorthair",
      "Mixed breed",
      "British Shorthair",
      "Persian",
      "Ragdoll",
      "Maine Coon",
      "Siamese",
      "Munchkin",
    ],
  },
  Rabbit: {
    personality: ["Gentle", "Curious", "Shy", "Playful", "Calm"],
    foods: ["Hay", "Leafy greens", "Carrots", "Pellets"],
    toys: ["Tunnel", "Chew sticks", "Willow ball"],
    breeds: ["Netherland Dwarf", "Holland Lop", "Lionhead", "Mixed breed"],
  },
  Bird: {
    personality: ["Chatty", "Curious", "Clever", "Social", "Cheeky"],
    foods: ["Seeds", "Millet", "Fruit", "Pellets"],
    toys: ["Swing", "Bell", "Ladder", "Foraging toy"],
    breeds: ["Budgerigar", "Cockatiel", "Lovebird", "Parrotlet"],
  },
  Hamster: {
    personality: ["Curious", "Busy", "Gentle", "Shy", "Speedy"],
    foods: ["Seeds", "Sunflower seeds", "Fresh veggies", "Pellets"],
    toys: ["Exercise wheel", "Tunnel", "Chew toy"],
    breeds: ["Syrian", "Roborovski", "Winter White", "Campbell's"],
  },
  "Guinea Pig": {
    personality: ["Gentle", "Social", "Vocal", "Curious", "Calm"],
    foods: ["Hay", "Bell peppers", "Leafy greens", "Pellets"],
    toys: ["Tunnel", "Hidey house", "Chew sticks"],
    breeds: ["American", "Abyssinian", "Peruvian"],
  },
  Fish: {
    personality: ["Calm", "Active", "Shy", "Bold", "Graceful"],
    foods: ["Flakes", "Pellets", "Bloodworms", "Brine shrimp"],
    toys: ["Aquarium plants", "Cave decoration", "Floating ring"],
    breeds: ["Betta", "Goldfish", "Guppy", "Koi"],
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
  Horse: {
    personality: ["Gentle", "Calm", "Proud", "Friendly", "Spirited"],
    foods: ["Hay", "Apples", "Carrots", "Oats"],
    toys: ["Jolly ball", "Salt lick", "Treat ball"],
    breeds: [],
  },
};

// Species-aware lookup with a friendly generic fallback for "Other" and any
// uncommon type that has no dedicated entry.
export function getPetSuggestions(species: PetSpecies): PetFieldSuggestions {
  return suggestionsBySpecies[species] ?? genericSuggestions;
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
