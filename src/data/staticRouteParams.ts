import { mockPets } from "@/data/mockPets";
import { mockTags } from "@/data/mockTags";

export function staticPetIdParams() {
  return mockPets.map((pet) => ({ id: pet.id }));
}

export function staticPublicPetParams() {
  return mockPets.map((pet) => ({ slug: `${pet.slug}-${pet.publicCode}` }));
}

export function staticTagCodeParams() {
  return mockTags.map((tag) => ({ tagCode: tag.tagCode }));
}
