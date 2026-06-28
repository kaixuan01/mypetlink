import { mockOrders } from "@/data/mockOrders";
import { mockPets } from "@/data/mockPets";
import { mockTags } from "@/data/mockTags";
import { formatOrderNumber } from "@/lib/orders";
import { derivePublicCode, getStaticTagCodeParamVariants } from "@/lib/tagCodes";

export function staticPetIdParams() {
  return mockPets.map((pet) => ({ id: pet.id }));
}

export function staticPublicPetParams() {
  // Use the same canonical publicCode the pet service produces, so the
  // statically-exported /p/{slug}-{publicCode} route always matches the URL
  // shown in the owner portal.
  return mockPets.map((pet) => ({
    slug: `${pet.slug}-${pet.publicCode ?? derivePublicCode(pet.id)}`,
  }));
}

export function staticTagCodeParams() {
  return mockTags.flatMap((tag) =>
    getStaticTagCodeParamVariants(tag.tagCode).map((tagCode) => ({ tagCode }))
  );
}

export function staticOrderParams() {
  return mockOrders.map((order) => ({ id: formatOrderNumber(order) }));
}
