import { mockOrders } from "@/data/mockOrders";
import { mockPets } from "@/data/mockPets";
import { mockTags } from "@/data/mockTags";
import { formatOrderNumber } from "@/lib/orders";

export function staticPetIdParams() {
  return mockPets.map((pet) => ({ id: pet.id }));
}

export function staticPublicPetParams() {
  return mockPets.map((pet) => ({ slug: `${pet.slug}-${pet.publicCode}` }));
}

export function staticTagCodeParams() {
  return mockTags.map((tag) => ({ tagCode: tag.tagCode }));
}

export function staticOrderParams() {
  return mockOrders.map((order) => ({ id: formatOrderNumber(order) }));
}
