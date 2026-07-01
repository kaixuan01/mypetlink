import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import {
  defaultOwnerSettings,
  getDefaultPetVisibility,
  readOwnerSettings,
} from "@/lib/ownerSettings";
import { getPetAgeLabel, PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import { publicProfilePath, qrSafetyPath } from "@/lib/routes";
import {
  derivePublicCode,
  deriveSafetyCode,
  generatePublicCode,
  generateSafetyCode,
} from "@/lib/tagCodes";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import type {
  Pet,
  PetLostMode,
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

// Canonical publicCode for a pet, used everywhere the public profile path is
// built so the portal URL, the stored path, and the static export always agree.
// Seed pets always resolve to their seed code (correcting any drifted stored
// value); other pets keep their own code, falling back to a deterministic
// derive so the path never changes between reads.
function canonicalPublicCode(pet: Pick<Pet, "id" | "publicCode">) {
  const seedPet = mockPets.find((seed) => seed.id === pet.id);
  return seedPet?.publicCode ?? pet.publicCode ?? derivePublicCode(pet.id);
}

function canonicalSafetyCode(pet: Pick<Pet, "id" | "safetyCode">) {
  const seedPet = mockPets.find((seed) => seed.id === pet.id);
  return seedPet?.safetyCode ?? pet.safetyCode ?? deriveSafetyCode(pet.id);
}

function mergeVisibility(
  visibility?: PetPayload["visibility"],
  baseVisibility: Pet["visibility"] = defaultVisibility
) {
  return {
    ...baseVisibility,
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

function getDefaultLostMode(petName: string, generalArea = ""): PetLostMode {
  return {
    lastSeenArea: generalArea || "Malaysia",
    lastSeenDateTime: "",
    lostMessage: `${petName} is currently missing. If you have found ${petName}, please contact the owner immediately.`,
    rewardNote: "",
    extraContactInstruction: "",
  };
}

function mergeLostMode(
  petName: string,
  generalArea: string,
  lostMode?: Partial<PetLostMode>
): PetLostMode {
  return {
    ...getDefaultLostMode(petName, generalArea),
    ...lostMode,
  };
}

function normalizeSpecies(pet: Pet): Pick<Pet, "species" | "customSpecies"> {
  if (PET_TYPE_OPTIONS.includes(pet.species)) {
    return {
      species: pet.species,
      customSpecies: pet.species === "Other" ? pet.customSpecies?.trim() : "",
    };
  }

  return {
    species: "Other",
    customSpecies: String(pet.species || pet.customSpecies || "Other").trim(),
  };
}

function normalizePet(pet: Pet): Pet {
  const publicCode = canonicalPublicCode(pet);
  const safetyCode = canonicalSafetyCode(pet);
  const safetyPath = qrSafetyPath(safetyCode);
  const createdAt =
    pet.createdAt ?? pet.updatedAt ?? "2026-01-01T00:00:00.000Z";
  const updatedAt = pet.updatedAt ?? createdAt;
  const species = normalizeSpecies(pet);

  return {
    ...pet,
    ...species,
    createdAt,
    updatedAt,
    gender: pet.gender ?? "Not set",
    color: pet.color ?? "Not set",
    ageLabel: getPetAgeLabel({
      birthday: pet.birthday ?? "Not set",
      ageLabel: pet.ageLabel ?? "Age not set",
      estimatedAge: pet.estimatedAge,
    }),
    birthday: pet.birthday ?? "Not set",
    adoptionDay: pet.adoptionDay ?? "Not set",
    photoInitial: pet.photoInitial ?? getPetInitial(pet.name),
    photoTone: pet.photoTone ?? (species.species === "Cat" ? "mint" : "apricot"),
    profilePhotoLabel: cleanMediaLabel(pet.profilePhotoLabel),
    coverPhotoLabel: cleanMediaLabel(pet.coverPhotoLabel),
    photoUrl: pet.photoUrl ?? "",
    coverUrl: pet.coverUrl ?? "",
    profileTheme: pet.profileTheme ?? "default",
    qrStatus: pet.qrStatus ?? "active",
    publicCode,
    safetyCode,
    qrSafetyEnabled: pet.qrSafetyEnabled ?? pet.qrStatus !== "paused",
    qrSafetyPath: safetyPath,
    // Always recompute from the canonical code so a stored/drifted path can
    // never point at a route that was not statically exported.
    publicProfilePath: publicProfilePath(pet.slug, publicCode),
    // Backward-compatible alias used by existing components. The value is the
    // pet-level /q safety page, not a physical /t tag scan link.
    finderProfileUrl: safetyPath,
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
    lostModeEnabled: pet.lostModeEnabled ?? false,
    lostMode: mergeLostMode(pet.name, pet.generalArea, pet.lostMode),
    contactOverride: pet.contactOverride ?? { useOwnerDefaults: false },
    visibility: {
      ...defaultVisibility,
      ...pet.visibility,
    },
  };
}

function getPetCollection() {
  return readStoredCollection(PET_STORAGE_KEY, mockPets).map(normalizePet);
}

function getUniquePetSlug(rawSlug: string, petName: string, pets: Pet[]) {
  const baseSlug =
    slugifyPetSlug(rawSlug || petName) || `pet-${Date.now().toString(36)}`;
  let slug = baseSlug;
  let suffix = 2;

  while (pets.some((pet) => pet.slug === slug || pet.id === `pet_${slug}`)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function getDefaultOwner(petName: string): Pet["owner"] {
  const settings = readOwnerSettings();
  const phone = settings.phoneNumber || settings.whatsappNumber;

  return {
    name: settings.ownerDisplayName || `${petName}'s owner`,
    phone,
    whatsapp: settings.whatsappNumber || settings.phoneNumber,
    emergencyContact: phone || settings.whatsappNumber,
  };
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
    pets.find((pet) => pet.id === id) ?? (id === "demo-pet" ? pets[0] : null)
  );
}

export function toPublicProfile(pet: Pet): PublicPetProfile {
  return {
    id: pet.id,
    slug: pet.slug,
    name: pet.name,
    species: pet.species,
    customSpecies: pet.customSpecies,
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
    photoUrl: pet.photoUrl,
    coverUrl: pet.coverUrl,
    profileTheme: pet.profileTheme,
    publicCode: pet.publicCode,
    safetyCode: pet.safetyCode,
    qrSafetyEnabled: pet.qrSafetyEnabled,
    qrSafetyPath: pet.qrSafetyPath,
    finderProfileUrl: pet.finderProfileUrl,
    publicProfilePath: pet.publicProfilePath,
    bio: pet.bio,
    personalityTags: pet.personalityTags,
    favoriteFood: pet.favoriteFood,
    favoriteToy: pet.favoriteToy,
    safetyNote: pet.safetyNote,
    emergencyNote: pet.emergencyNote,
    lostModeEnabled: pet.lostModeEnabled,
    lostMode: pet.lostMode,
    owner: pet.owner,
    contactOverride: pet.contactOverride,
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

export async function getPublicPetProfileBySafetyCode(safetyCode: string) {
  await mockDelay();
  const normalized = safetyCode.trim().toLowerCase();
  const pet = getPetCollection().find(
    (item) => item.safetyCode.toLowerCase() === normalized
  );

  if (!pet || !pet.qrSafetyEnabled) {
    return mockResponse<PublicPetProfile | null>(null);
  }

  return mockResponse(toPublicProfile(pet));
}

export async function createPet(payload: PetPayload) {
  await mockDelay();
  const pets = getPetCollection();
  const ownerSettings = readOwnerSettings();
  const petName = payload.name?.trim() || "New pet";
  const slug = getUniquePetSlug(payload.slug ?? petName, petName, pets);
  const now = new Date().toISOString();
  const publicCode = generatePublicCode();
  const safetyCode = generateSafetyCode();
  const safetyPath = qrSafetyPath(safetyCode);
  const generalArea =
    payload.generalArea ??
    ownerSettings.defaultGeneralArea ??
    defaultOwnerSettings.defaultGeneralArea;

  const pet: Pet = {
    ...mockPets[0],
    id: `pet_${slug}`,
    slug,
    name: petName,
    species: payload.species ?? "Dog",
    customSpecies:
      payload.species === "Other" ? payload.customSpecies?.trim() : "",
    breed: payload.breed ?? "Mixed breed",
    gender: payload.gender ?? "Unknown",
    color: payload.color ?? "Not set",
    ageLabel: payload.ageLabel ?? "Age not set",
    birthday: payload.birthday ?? "Not set",
    adoptionDay: payload.adoptionDay ?? "Not set",
    createdAt: now,
    updatedAt: now,
    generalArea,
    photoInitial: payload.photoInitial ?? getPetInitial(petName),
    photoTone:
      payload.photoTone ?? (payload.species === "Cat" ? "mint" : "apricot"),
    profilePhotoLabel: payload.profilePhotoLabel ?? "",
    coverPhotoLabel: payload.coverPhotoLabel ?? "",
    photoUrl: payload.photoUrl ?? "",
    coverUrl: payload.coverUrl ?? "",
    profileTheme: payload.profileTheme ?? "default",
    publicCode,
    safetyCode,
    qrSafetyEnabled: payload.qrSafetyEnabled ?? true,
    qrSafetyPath: safetyPath,
    finderProfileUrl: safetyPath,
    publicProfilePath: publicProfilePath(slug, publicCode),
    bio:
      payload.bio ??
      `${petName} has a safe MyPetLink profile ready for family and friends.`,
    personalityTags: payload.personalityTags ?? ["Loved", "Family pet"],
    favoriteFood: payload.favoriteFood ?? "Not set",
    favoriteToy: payload.favoriteToy ?? "Not set",
    safetyNote: payload.safetyNote ?? "No safety note yet.",
    emergencyNote: payload.emergencyNote ?? "No emergency note yet.",
    lostModeEnabled: payload.lostModeEnabled ?? false,
    lostMode: mergeLostMode(
      petName,
      generalArea,
      payload.lostMode
    ),
    owner: mergeOwner(getDefaultOwner(petName), payload.owner),
    contactOverride: payload.contactOverride ?? { useOwnerDefaults: true },
    visibility: mergeVisibility(
      payload.visibility,
      getDefaultPetVisibility(ownerSettings)
    ),
    allergies: [],
    medications: [],
    qrStatus: payload.qrStatus ?? "active",
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
  const safetyPath = pet ? qrSafetyPath(pet.safetyCode) : "";
  const updatedPet = pet
    ? {
        ...pet,
        ...payload,
        slug: nextSlug ?? pet.slug,
        customSpecies:
          payload.species === "Other"
            ? payload.customSpecies?.trim() || pet.customSpecies
            : "",
        publicProfilePath: publicProfilePath(nextSlug ?? pet.slug, pet.publicCode),
        safetyCode: pet.safetyCode,
        qrSafetyPath: safetyPath,
        finderProfileUrl: safetyPath,
        updatedAt: new Date().toISOString(),
        photoInitial:
          payload.photoInitial ??
          (payload.name ? getPetInitial(payload.name) : pet.photoInitial),
        lostMode: payload.lostMode
          ? mergeLostMode(
              payload.name ?? pet.name,
              payload.generalArea ?? pet.generalArea,
              {
                ...pet.lostMode,
                ...payload.lostMode,
              }
            )
          : pet.lostMode,
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

export async function updatePetLostMode(
  id: string,
  lostModeEnabled: boolean,
  lostMode?: Partial<PetLostMode>
) {
  const pet = await getPetById(id);

  if (!pet.data) {
    return mockResponse<Pet | null>(null);
  }

  return updatePet(id, {
    lostModeEnabled,
    lostMode: mergeLostMode(pet.data.name, pet.data.generalArea, {
      ...pet.data.lostMode,
      ...lostMode,
    }),
  });
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
