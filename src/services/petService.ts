import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import { publicProfilePath } from "@/lib/routes";
import { generatePublicCode, generateTagCode } from "@/lib/tagCodes";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import type {
  Pet,
  PetPayload,
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

// Stable fallback publicCode for legacy stored pets saved before publicCode
// existed. Deterministic so the public profile path never changes on re-read.
function derivePublicCode(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";

  for (let index = 0; index < 4; index += 1) {
    code += chars[hash % chars.length];
    hash = Math.floor(hash / chars.length);
  }

  return code;
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
  const publicCode = pet.publicCode ?? derivePublicCode(pet.id);

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
    profileTheme: pet.profileTheme ?? "default",
    publicCode,
    publicProfilePath:
      pet.publicProfilePath ?? publicProfilePath(pet.slug, publicCode),
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
  const publicCode = derivePublicCode(slug);

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
    profileTheme: "default",
    qrStatus: "draft",
    finderProfileUrl: `/t/${generateTagCode()}`,
    publicCode,
    publicProfilePath: publicProfilePath(slug, publicCode),
    bio: `${name} has a safe MyPetLink profile ready for family and friends.`,
    personalityTags: ["Loved", "Family pet"],
    favoriteFood: "Not set",
    favoriteToy: "Not set",
    safetyNote: "Please contact the owner if this pet is found.",
    emergencyNote: "Keep calm and contact the owner first.",
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

export function toPublicProfile(pet: Pet): PublicPetProfile {
  return {
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
    profileTheme: pet.profileTheme,
    publicCode: pet.publicCode,
    finderProfileUrl: pet.finderProfileUrl,
    publicProfilePath: pet.publicProfilePath,
    bio: pet.bio,
    personalityTags: pet.personalityTags,
    favoriteFood: pet.favoriteFood,
    favoriteToy: pet.favoriteToy,
    safetyNote: pet.safetyNote,
    emergencyNote: pet.emergencyNote,
    owner: pet.owner,
    visibility: {
      ...defaultVisibility,
      ...pet.visibility,
    },
  };
}

// Public profiles are resolved by the stable publicCode (the last segment of
// /p/{slug}-{publicCode}), never by slug — so renaming a pet never breaks an
// already-shared link.
export async function getPublicPetProfileByPublicCode(publicCode: string) {
  await mockDelay();
  const normalized = publicCode.trim().toLowerCase();
  const pet = getPetCollection().find(
    (item) => item.publicCode.toLowerCase() === normalized
  );

  if (!pet) {
    return mockResponse<PublicPetProfile | null>(null);
  }

  return mockResponse(toPublicProfile(pet));
}

export async function createPet(payload: PetPayload) {
  await mockDelay();
  const pets = getPetCollection();
  const petName = payload.name?.trim() || "New pet";
  const slug = slugifyPetSlug(payload.slug ?? petName) || `pet-${Date.now()}`;
  const publicCode = generatePublicCode();

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
    profileTheme: payload.profileTheme ?? "default",
    finderProfileUrl: `/t/${generateTagCode()}`,
    publicCode,
    publicProfilePath: publicProfilePath(slug, publicCode),
    bio:
      payload.bio ??
      `${petName} has a safe MyPetLink profile ready for family and friends.`,
    personalityTags: payload.personalityTags ?? ["Loved", "Family pet"],
    favoriteFood: payload.favoriteFood ?? "Not set",
    favoriteToy: payload.favoriteToy ?? "Not set",
    safetyNote: payload.safetyNote ?? "No safety note yet.",
    emergencyNote: payload.emergencyNote ?? "No emergency note yet.",
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
        publicProfilePath: publicProfilePath(nextSlug ?? pet.slug, pet.publicCode),
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
