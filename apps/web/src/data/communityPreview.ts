/**
 * The three cards on the landing page's Community section.
 *
 * **Discoverability is not marketing consent.** A family switching a pet's
 * Social profile on agreed to appear inside Community — in Explore, in Search,
 * on their own public profile. They did not agree to be the face of the product
 * on its front page, and treating one permission as the other helps ourselves
 * to a consent nobody gave.
 *
 * So nothing here is chosen from live data, and no eligibility flag is consulted
 * to build it. There is no query to get wrong later: a pet cannot arrive on this
 * page because of something an owner toggled, only because somebody wrote it
 * here on purpose.
 *
 * **Not even an approved sample.** This list previously took its first card from
 * `staticSampleExperiencePet` — a real pet's name and a real photo URL under a
 * real pet's media path. That content IS governed elsewhere: the sample
 * experience is gated on `Pet.IsSampleEligible` plus an admin-chosen featured
 * pet, so an admin can withdraw it. A hardcoded copy of it here could not be
 * withdrawn — revoke the flag and the homepage would keep showing the photo.
 * Marketing content that outlives its own approval is the defect, separately
 * from whose pet it happens to be.
 *
 * What is left is content MyPetLink owns outright: Linko, the brand mascot
 * drawn for this product, and two illustrative pets that are not anybody. They
 * carry no photo URL, no handle, no public code and no link to a real profile.
 *
 * **No household is named and no counts appear.** Naming one would either
 * expose an identity or invent a person, and an empty network that advertises
 * follower numbers is lying.
 *
 * A future explicit opt-in — "allow MyPetLink to feature this pet in promotional
 * surfaces" — would be the right way to widen this, and would be a separate
 * decision from Social discoverability. See the report for that suggestion; it
 * is deliberately not built here.
 */

import type { LinkoPose } from "@/components/brand/LinkoMascot";
import type { PetSpecies } from "@/types";

export type CommunityPreviewCard = {
  id: string;
  petName: string;
  species: PetSpecies;
  breed: string;
  /**
   * How the card is illustrated. A mascot pose is brand art; a tone is the
   * initial avatar the app already draws for a pet with no photo. Deliberately
   * no URL field: there is nowhere for a real pet's media to be pasted in.
   */
  mascot?: LinkoPose;
  photoInitial: string;
  photoTone: "mint" | "apricot" | "sky";
  momentTitle: string;
  momentCaption: string;
};

export const communityPreviewCards: CommunityPreviewCard[] = [
  {
    id: "linko",
    petName: "Linko",
    species: "Cat",
    breed: "MyPetLink mascot",
    mascot: "wave",
    photoInitial: "L",
    photoTone: "mint",
    momentTitle: "Sunny spot, claimed",
    momentCaption:
      "Found the one patch of afternoon light and refused to give it up.",
  },
  {
    id: "sample-milo",
    petName: "Milo",
    species: "Dog",
    breed: "Golden Retriever",
    photoInitial: "M",
    photoTone: "apricot",
    momentTitle: "First day home",
    momentCaption:
      "New house, new bed, and a very thorough inspection of both.",
  },
  {
    id: "sample-luna",
    petName: "Luna",
    species: "Cat",
    breed: "British Shorthair",
    photoInitial: "L",
    photoTone: "sky",
    momentTitle: "Grooming day",
    momentCaption: "Fresh fur, clean paws, and a very serious pose.",
  },
];
