import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import type {
  Pet,
  PetPayload,
  PetProfileThemeId,
  PublicPetProfile,
} from "@/types";

const PET_STORAGE_KEY = "mypetlink_pets";

const defaultVisibility: Pet["visibility"] = {
  showOwnerName: true,
  showGeneralArea: true,
  showPhone: true,
  showWhatsapp: true,
  showEmergencyNote: true,
  showCareBadges: true,
  showMoments: true,
  showTimeline: true,
  showBirthdayOnTimeline: true,
  showAdoptionDayOnTimeline: true,
  showHealthSummary: false,
};

export function slugifyPetSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPetInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

function cleanMediaLabel(value: string) {
  if (!value || /not added/i.test(value)) {
    return "";
  }

  return value;
}

function getThemeFromCoverTone(coverTone?: Pet["coverTone"]): PetProfileThemeId {
  if (coverTone === "mint") {
    return "mint";
  }

  if (coverTone === "apricot") {
    return "peach";
  }

  if (coverTone === "sky") {
    return "sky";
  }

  return "default";
}

function createTagCode(slug: string) {
  return `${slug.toUpperCase().replace(/-/g, "").slice(0, 8)}-QR`;
}

function mergeVisibility(visibility?: PetPayload["visibility"]) {
  return {
    ...defaultVisibility,
    ...visibility,
  };
}

function mergeOwner(
  baseOwner: Pet["owner"],
  owner?: PetPayload["owner"]
): Pet["owner"] {
  return {
    ...baseOwner,
    ...owner,
  };
}

function normalizePet(pet: Pet): Pet {
  return {
    ...pet,
    gender: pet.gender ?? "Not set",
    color: pet.color ?? "Not set",
    ageLabel: pet.ageLabel ?? "Age not set",
    birthday: pet.birthday ?? "Not set",
    adoptionDay: pet.adoptionDay ?? "Not set",
    photoInitial: pet.photoInitial ?? getPetInitial(pet.name),
    photoTone: pet.photoTone ?? "apricot",
    profilePhotoLabel: cleanMediaLabel(pet.profilePhotoLabel),
    coverPhotoLabel: cleanMediaLabel(pet.coverPhotoLabel),
    coverTone: pet.coverTone ?? "sky",
    profileTheme: pet.profileTheme ?? getThemeFromCoverTone(pet.coverTone),
    publicProfileUrl: pet.publicProfileUrl ?? `/p/${pet.slug}`,
    bio:
      pet.bio ??
      `${pet.name} has a safe MyPetLink profile ready for family and friends.`,
    personalityTags: pet.personalityTags?.length
      ? pet.personalityTags
      : ["Loved", "Family pet"],
    favoriteFood: pet.favoriteFood ?? "Not set",
    favoriteToy: pet.favoriteToy ?? "Not set",
    safetyNote:
      pet.safetyNote ?? "Please contact the owner if this pet is found.",
    emergencyNote: pet.emergencyNote ?? "Keep calm and contact the owner first.",
    contactPreference: pet.contactPreference ?? "WhatsApp preferred",
    visibility: {
      ...defaultVisibility,
      ...pet.visibility,
    },
  };
}

function getPetCollection() {
  return readStoredCollection(PET_STORAGE_KEY, mockPets).map(normalizePet);
}

function titleFromSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createFallbackPetFromSlug(slug: string): Pet {
  const name = titleFromSlug(slug) || "New Pet";
  const tagCode = createTagCode(slug);

  return {
    ...mockPets[0],
    id: `pet_${slug}`,
    slug,
    name,
    gender: "Not set",
    color: "Not set",
    birthday: "Not set",
    adoptionDay: "Not set",
    ageLabel: "Age not set",
    generalArea: "Malaysia",
    photoInitial: getPetInitial(name),
    profilePhotoLabel: "",
    coverPhotoLabel: "",
    coverTone: "sky",
    profileTheme: "default",
    qrStatus: "draft",
    finderProfileUrl: `/t/${tagCode}`,
    publicProfileUrl: `/p/${slug}`,
    bio: `${name} has a safe MyPetLink profile ready for family and friends.`,
    personalityTags: ["Loved", "Family pet"],
    favoriteFood: "Not set",
    favoriteToy: "Not set",
    safetyNote: "Please contact the owner if this pet is found.",
    emergencyNote: "Keep calm and contact the owner first.",
    contactPreference: "WhatsApp preferred",
    visibility: defaultVisibility,
  };
}

function createFallbackPetFromId(id: string) {
  if (!id.startsWith("pet_")) {
    return null;
  }

  return createFallbackPetFromSlug(id.replace(/^pet_/, ""));
}

export async function getPets() {
  await mockDelay();
  const pets = getPetCollection();

  return mockResponse(pets, {
    page: 1,
    pageSize: pets.length,
    total: pets.length,
  });
}

export async function getPetById(id: string) {
  await mockDelay();
  const pets = getPetCollection();

  return mockResponse(
    pets.find((pet) => pet.id === id) ??
      (id === "demo-pet" ? pets[0] : createFallbackPetFromId(id))
  );
}

export async function getPublicPetProfile(slug: string) {
  await mockDelay();
  const pet =
    getPetCollection().find((item) => item.slug === slug) ??
    createFallbackPetFromSlug(slug);

  if (!pet) {
    return mockResponse<PublicPetProfile | null>(null);
  }

  const publicProfile: PublicPetProfile = {
    id: pet.id,
    slug: pet.slug,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    gender: pet.gender,
    color: pet.color,
    ageLabel: pet.ageLabel,
    birthday: pet.birthday,
    adoptionDay: pet.adoptionDay,
    generalArea: pet.generalArea,
    photoInitial: pet.photoInitial,
    photoTone: pet.photoTone,
    profilePhotoLabel: "",
    coverPhotoLabel: "",
    coverTone: pet.coverTone,
    profileTheme: pet.profileTheme,
    finderProfileUrl: pet.finderProfileUrl,
    publicProfileUrl: pet.publicProfileUrl,
    bio: pet.bio,
    personalityTags: pet.personalityTags,
    favoriteFood: pet.favoriteFood,
    favoriteToy: pet.favoriteToy,
    safetyNote: pet.safetyNote,
    emergencyNote: pet.emergencyNote,
    contactPreference: pet.contactPreference,
    owner: pet.owner,
    visibility: {
      ...defaultVisibility,
      ...pet.visibility,
    },
  };

  return mockResponse(publicProfile);
}

export async function createPet(payload: PetPayload) {
  await mockDelay();
  const pets = getPetCollection();
  const petName = payload.name?.trim() || "New pet";
  const slug = slugifyPetSlug(payload.slug ?? petName) || `pet-${Date.now()}`;
  const tagCode = createTagCode(slug);

  const pet: Pet = {
    ...mockPets[0],
    id: `pet_${slug}`,
    slug,
    name: petName,
    species: payload.species ?? "Dog",
    breed: payload.breed ?? "Mixed breed",
    gender: payload.gender ?? "Unknown",
    color: payload.color ?? "Not set",
    ageLabel: payload.ageLabel ?? "Age not set",
    birthday: payload.birthday ?? "Not set",
    adoptionDay: payload.adoptionDay ?? "Not set",
    generalArea: payload.generalArea ?? "Malaysia",
    photoInitial: payload.photoInitial ?? getPetInitial(petName),
    photoTone: payload.photoTone ?? "apricot",
    profilePhotoLabel: payload.profilePhotoLabel ?? "",
    coverPhotoLabel: payload.coverPhotoLabel ?? "",
    coverTone: payload.coverTone ?? "sky",
    profileTheme: payload.profileTheme ?? "default",
    finderProfileUrl: `/t/${tagCode}`,
    publicProfileUrl: `/p/${slug}`,
    bio:
      payload.bio ??
      `${petName} has a safe MyPetLink profile ready for family and friends.`,
    personalityTags: payload.personalityTags ?? ["Loved", "Family pet"],
    favoriteFood: payload.favoriteFood ?? "Not set",
    favoriteToy: payload.favoriteToy ?? "Not set",
    safetyNote: payload.safetyNote ?? "No safety note yet.",
    emergencyNote: payload.emergencyNote ?? "No emergency note yet.",
    contactPreference: payload.contactPreference ?? "WhatsApp preferred",
    owner: mergeOwner(mockPets[0].owner, payload.owner),
    visibility: mergeVisibility(payload.visibility),
    qrStatus: "draft",
  };

  writeStoredCollection(PET_STORAGE_KEY, [pet, ...pets]);

  return mockResponse(pet);
}

export async function updatePet(id: string, payload: PetPayload) {
  await mockDelay();
  const pets = getPetCollection();
  const pet = pets.find((item) => item.id === id);
  const nextSlug =
    pet && payload.slug ? slugifyPetSlug(payload.slug) || pet.slug : pet?.slug;
  const updatedPet = pet
    ? {
        ...pet,
        ...payload,
        slug: nextSlug ?? pet.slug,
        publicProfileUrl: `/p/${nextSlug ?? pet.slug}`,
        photoInitial:
          payload.photoInitial ??
          (payload.name ? getPetInitial(payload.name) : pet.photoInitial),
        owner: mergeOwner(pet.owner, payload.owner),
        visibility: {
          ...defaultVisibility,
          ...pet.visibility,
          ...payload.visibility,
        },
      }
    : null;

  if (updatedPet) {
    writeStoredCollection(
      PET_STORAGE_KEY,
      pets.map((item) => (item.id === id ? updatedPet : item))
    );
  }

  return mockResponse(updatedPet);
}

export async function getPetHealthSummary(petId: string) {
  await mockDelay();
  const records = mockRecords.filter((record) => record.petId === petId);
  const upcoming = records.filter((record) => record.status !== "complete");

  return mockResponse({
    totalRecords: records.length,
    upcomingCare: upcoming.length,
    latestRecord: records[0] ?? null,
  });
}
