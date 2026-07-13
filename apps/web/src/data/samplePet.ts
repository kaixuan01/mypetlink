import { mockPets } from "@/data/mockPets";
import {
  indexableSamplePublicCode,
  indexableSamplePublicSlug,
} from "@/data/publicSample";
import type { Pet } from "@/types";

/**
 * Public, intentional search sample. It is separate from owner-portal seed data
 * so the marketing site and static export can render without an API request.
 * Values mirror the public Topu profile; no private owner identifier is stored.
 */
export const samplePet: Pet = {
  ...mockPets[0],
  id: "sample_topu",
  ownerUserId: undefined,
  slug: "topu",
  name: "Topu",
  species: "Cat",
  breed: "Domestic Shorthair",
  gender: "Male",
  color: "Grey",
  ageLabel: "Under 1 year old",
  ageSource: "ExactBirthday",
  ageInformationMode: "ExactBirthday",
  estimatedBirthYear: undefined,
  birthday: "19 Jan 2026",
  adoptionDay: "Not set",
  generalArea: "Ampang, Kuala Lumpur",
  photoInitial: "T",
  photoTone: "mint",
  photoUrl:
    "https://media.mypetlink.com.my/pets/03241526-0d9e-42fb-9ef5-8bbcbdb424f5/profile/880dee99fa4d44e2ab1ccac3eb31bf85.jpg",
  coverUrl:
    "https://media.mypetlink.com.my/pets/03241526-0d9e-42fb-9ef5-8bbcbdb424f5/covers/e2d9387de749425ba576e3a3baf78574.jpg",
  coverPositionX: 50,
  coverPositionY: 0,
  profileTheme: "default",
  publicCode: indexableSamplePublicCode,
  safetyCode: "sl3j2b2q3e2oqhe4iamqa",
  qrSafetyPath: "/q/sl3j2b2q3e2oqhe4iamqa",
  finderProfileUrl: "/q/sl3j2b2q3e2oqhe4iamqa",
  publicProfilePath: `/p/${indexableSamplePublicSlug}`,
  bio: "Curious, friendly, and always looking for treats.",
  personalityTags: ["Curious", "Friendly", "Treat lover"],
  safetyNote: "Please contact the owner if this pet is found.",
  emergencyNote: "Keep calm and contact the owner first.",
  lostMode: {
    ...mockPets[0].lostMode,
    lastSeenArea: "Ampang, Kuala Lumpur",
    lostMessage:
      "Topu is currently missing. If you have found Topu, please contact the owner immediately.",
  },
  owner: {
    name: "GBB Software Solutions",
    phone: "",
    whatsapp: "",
    emergencyContact: "",
  },
  contactOverride: {
    useOwnerDefaults: false,
    ownerDisplayName: "GBB Software Solutions",
    generalArea: "Ampang, Kuala Lumpur",
  },
  visibility: {
    ...mockPets[0].visibility,
    showPhone: false,
    showWhatsapp: false,
  },
};
