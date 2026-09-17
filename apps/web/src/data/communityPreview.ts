import { staticSampleExperiencePet } from "@/data/publicSample";

/**
 * The three cards on the landing page's Community section.
 *
 * **Why this is a static list and not a query.** A pet being discoverable means
 * its family agreed to appear inside Community. It does not mean they agreed to
 * be marketing on the front page of the website, and treating one as the other
 * would be helping ourselves to a consent nobody gave. Real households are
 * reachable one click away, in Explore, where the rule they actually opted into
 * applies.
 *
 * So this is MyPetLink's own demo content: the sample pet the marketing site
 * already publishes, plus two illustrative pets.
 *
 * **No household is named.** Not even the sample's — the name attached to that
 * pet is its *finder-facing* owner name, and the finder identity and the Social
 * identity are separate things that must not be quietly merged. A card here
 * shows a pet and a Moment, and attributing it to anybody would either expose
 * the wrong identity or invent a person.
 *
 * **No counts of any kind.** No likes, no followers, no "join 2,000 families".
 * An empty network that advertises numbers is lying, and a real one does not
 * need to.
 */

export type CommunityPreviewCard = {
  id: string;
  petName: string;
  species: string;
  breed: string;
  /** A real photo where we own one; otherwise the initial avatar the app uses. */
  photoUrl: string | null;
  photoInitial: string;
  photoTone: "mint" | "apricot" | "sky";
  momentTitle: string;
  momentCaption: string;
};

export const communityPreviewCards: CommunityPreviewCard[] = [
  {
    id: "sample-topu",
    petName: staticSampleExperiencePet.name,
    species: staticSampleExperiencePet.species,
    breed: "Domestic Shorthair",
    photoUrl: staticSampleExperiencePet.profilePhotoUrl,
    photoInitial: "T",
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
    photoUrl: null,
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
    photoUrl: null,
    photoInitial: "L",
    photoTone: "sky",
    momentTitle: "Grooming day",
    momentCaption: "Fresh fur, clean paws, and a very serious pose.",
  },
];
