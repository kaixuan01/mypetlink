import { mockOrders } from "@/data/mockOrders";
import { mockPets } from "@/data/mockPets";
import { mockTags } from "@/data/mockTags";
import { samplePet } from "@/data/samplePet";
import { formatOrderNumber } from "@/lib/orders";
import {
  derivePublicCode,
  deriveSafetyCode,
  getStaticTagCodeParamVariants,
} from "@/lib/tagCodes";

export function staticPetIdParams() {
  return mockPets.map((pet) => ({ id: pet.id }));
}

export function staticPublicPetParams() {
  // Use the same canonical publicCode the pet service produces, so the
  // statically-exported /p/{slug}-{publicCode} route always matches the URL
  // shown in the owner portal.
  return [...mockPets, samplePet].map((pet) => ({
    slug: `${pet.slug}-${pet.publicCode ?? derivePublicCode(pet.id)}`,
  }));
}

/**
 * Build-time handles for the exported /u/{handle} shell.
 *
 * Real profiles are served by the Pages Function, which rewrites this shell's
 * head for whichever handle was requested. This list therefore only needs to
 * produce a page to serve — it is not the set of live handles, and must never be
 * treated as one.
 */
export function staticOwnerHandleParams() {
  return [{ handle: "mypetlink-profile" }];
}

export function staticTagCodeParams() {
  return mockTags.flatMap((tag) =>
    getStaticTagCodeParamVariants(tag.tagCode).map((tagCode) => ({ tagCode }))
  );
}

export function staticQrSafetyParams() {
  const safetyParams = [...mockPets, samplePet].flatMap((pet) => {
    const safetyCode = pet.safetyCode ?? deriveSafetyCode(pet.id);
    return Array.from(new Set([safetyCode, safetyCode.toLowerCase()])).map(
      (code) => ({ safetyCode: code })
    );
  });
  const tagParams = staticTagCodeParams().map(({ tagCode }) => ({
    safetyCode: tagCode,
  }));

  return Array.from(
    new Map(
      [...safetyParams, ...tagParams].map((item) => [
        item.safetyCode,
        item,
      ])
    ).values()
  );
}

export function staticOrderParams() {
  return mockOrders.map((order) => ({ id: formatOrderNumber(order) }));
}
