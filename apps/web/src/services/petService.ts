import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import {
  defaultOwnerSettings,
  getDefaultPetVisibility,
  readOwnerSettings,
} from "@/lib/ownerSettings";
import { getPetAgeLabel, PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import {
  getCountedPetProfiles,
  getPetLifecycleStatus,
  isActivePet,
  isArchivedPet,
} from "@/lib/petLifecycle";
import { freePlanLimits } from "@/lib/planLimits";
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
import {
  apiRequest,
  isApiClientError,
} from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import type {
  BackendPetDetail,
  BackendPetListItem,
  BackendPublicPetProfile,
  BackendPublicSafetyPage,
} from "@/services/apiDtos";
import type {
  ApiResponse,
  Pet,
  PetLifecycleStatus,
  PetLostMode,
  PetMemorial,
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

type BackendListEnvelope<T> = {
  data?: T;
  meta?: {
    requestId?: string;
    page?: number | null;
    pageSize?: number | null;
    total?: number | null;
  };
};

function apiResponse<T>(envelope: BackendListEnvelope<T>, fallbackData: T): ApiResponse<T> {
  return {
    data: envelope.data ?? fallbackData,
    meta: {
      requestId: envelope.meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
      page: envelope.meta?.page ?? undefined,
      pageSize: envelope.meta?.pageSize ?? undefined,
      total: envelope.meta?.total ?? undefined,
    },
  };
}

function apiNullResponse<T>(): ApiResponse<T | null> {
  return {
    data: null,
    meta: {
      requestId: `api_${Date.now()}`,
      source: "api",
    },
  };
}

function isNotFoundLike(error: unknown) {
  return isApiClientError(error) && [403, 404].includes(error.status);
}

export function getFriendlyApiErrorMessage(error: unknown) {
  if (isApiClientError(error)) {
    if (error.code === "plan_limit_reached") {
      return error.message;
    }

    if (error.code === "validation_failed" && error.details) {
      const firstField = Object.values(error.details)[0]?.[0];
      return firstField ?? error.message;
    }

    if (error.status === 0) {
      return "We could not reach MyPetLink right now. Please try again.";
    }

    return error.message;
  }

  return "Something went wrong. Please try again.";
}

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

function getDefaultMemorial(): PetMemorial {
  return {
    passedAwayDate: "",
    memorialMessage: "",
    showMemorialOnPublicProfile: true,
  };
}

function mergeMemorial(memorial?: Partial<PetMemorial>): PetMemorial {
  return {
    ...getDefaultMemorial(),
    ...memorial,
  };
}

function normalizeLifecycleStatus(
  value?: PetLifecycleStatus | string
): PetLifecycleStatus {
  return getPetLifecycleStatus({ lifecycleStatus: value });
}

function getPreviousLifecycleStatus(pet: Pet): Exclude<PetLifecycleStatus, "Archived"> {
  const current = normalizeLifecycleStatus(pet.lifecycleStatus);

  if (current === "Memorial") {
    return "Memorial";
  }

  if (pet.previousLifecycleStatus === "Memorial") {
    return "Memorial";
  }

  return "Active";
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
    lifecycleStatus: normalizeLifecycleStatus(pet.lifecycleStatus),
    previousLifecycleStatus:
      pet.previousLifecycleStatus === "Memorial" ? "Memorial" : "Active",
    memorial: mergeMemorial(pet.memorial),
    qrStatus: pet.qrStatus ?? "active",
    publicCode,
    safetyCode,
    qrSafetyEnabled: pet.qrSafetyEnabled ?? pet.qrStatus !== "paused",
    qrSafetyPath: safetyPath,
    // Always recompute from the canonical code so a stored/drifted path can
    // never point at a route that was not statically exported.
    publicProfilePath: publicCode
      ? publicProfilePath(pet.slug, publicCode)
      : pet.publicProfilePath ?? "",
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

function normalizeBackendSpecies(
  species: string,
  customSpecies?: string | null
): Pick<Pet, "species" | "customSpecies"> {
  if (PET_TYPE_OPTIONS.includes(species as Pet["species"])) {
    return {
      species: species as Pet["species"],
      customSpecies: species === "Other" ? customSpecies?.trim() : "",
    };
  }

  return {
    species: "Other",
    customSpecies: customSpecies?.trim() || species || "Other",
  };
}

function toDisplayDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function toIsoDate(value?: string | null) {
  if (!value || value === "Not set" || /^estimated/i.test(value)) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(month);

  if (monthIndex < 0) {
    return null;
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function getProfileTheme(value?: string | null): Pet["profileTheme"] {
  return ["default", "mint", "peach", "sky", "lavender"].includes(value ?? "")
    ? (value as Pet["profileTheme"])
    : "default";
}

function getPhotoTone(species: Pet["species"]): Pet["photoTone"] {
  return species === "Cat" ? "mint" : species === "Bird" ? "sky" : "apricot";
}

function getSlugFromPublicSlug(publicSlug: string, publicCode: string) {
  const suffix = `-${publicCode}`.toLowerCase();
  const lowerSlug = publicSlug.toLowerCase();

  if (lowerSlug.endsWith(suffix)) {
    return publicSlug.slice(0, publicSlug.length - suffix.length) || "pet";
  }

  return publicSlug || "pet";
}

export function mapBackendPetToFrontend(
  pet: BackendPetDetail | BackendPetListItem
): Pet {
  const species = normalizeBackendSpecies(pet.species, pet.customSpecies);
  const detail = "contact" in pet ? pet : null;
  const ownerSettings = readOwnerSettings();
  const publicSlug = pet.publicSlug || PetDtoFallbackSlug(pet.name, pet.publicCode);
  const slug = getSlugFromPublicSlug(publicSlug, pet.publicCode);
  const birthday = detail ? toDisplayDate(detail.birthday) : "Not set";
  const adoptionDay = detail ? toDisplayDate(detail.adoptionDay) : "Not set";
  const ageLabel = getPetAgeLabel({
    birthday,
    ageLabel: "Age unknown",
    estimatedAge: "",
  });
  const visibility = mergeVisibility(detail?.visibility ?? defaultVisibility);
  const contact = detail?.contact;
  const phone = contact?.phoneE164 ?? ownerSettings.phoneNumber;
  const whatsapp = contact?.whatsappE164 ?? ownerSettings.whatsappNumber;
  const generalArea =
    detail?.generalArea ??
    contact?.generalAreaOverride ??
    ownerSettings.defaultGeneralArea ??
    "Malaysia";
  const safetyPath = qrSafetyPath(pet.safetyCode);

  return normalizePet({
    id: pet.id,
    slug,
    name: pet.name,
    species: species.species,
    customSpecies: species.customSpecies,
    breed: detail?.breed || "Not set",
    gender: detail?.gender || "Not set",
    color: detail?.color || "Not set",
    ageLabel,
    birthday,
    adoptionDay,
    createdAt: pet.createdAt,
    updatedAt: pet.updatedAt,
    generalArea,
    photoInitial: getPetInitial(pet.name),
    photoTone: getPhotoTone(species.species),
    profilePhotoLabel: "",
    coverPhotoLabel: "",
    photoUrl: "",
    coverUrl: "",
    profileTheme: getProfileTheme(detail?.profileTheme),
    lifecycleStatus: pet.lifecycleStatus,
    previousLifecycleStatus:
      pet.lifecycleStatus === "Memorial" ? "Memorial" : "Active",
    memorial: {
      passedAwayDate: toDisplayDate(detail?.memorialPassedAwayDate),
      memorialMessage: detail?.memorialMessage ?? "",
      showMemorialOnPublicProfile:
        detail?.showMemorialOnPublicProfile ?? true,
    },
    qrStatus: "active",
    publicCode: pet.publicCode,
    safetyCode: pet.safetyCode,
    qrSafetyEnabled: true,
    qrSafetyPath: safetyPath,
    finderProfileUrl: safetyPath,
    publicProfilePath: publicProfilePath(slug, pet.publicCode),
    bio:
      detail?.bio ||
      `${pet.name} has a safe MyPetLink profile ready for family and friends.`,
    personalityTags: ["Loved", "Family pet"],
    favoriteFood: "Not set",
    favoriteToy: "Not set",
    safetyNote:
      detail?.safetyNote || "Please contact the owner if this pet is found.",
    emergencyNote:
      detail?.emergencyNote || "Keep calm and contact the owner first.",
    lostModeEnabled: pet.lostModeEnabled,
    lostMode: {
      lastSeenArea: detail?.lostLastSeenArea ?? generalArea,
      lastSeenDateTime: detail?.lostLastSeenDateTime ?? "",
      lostMessage:
        detail?.lostMessage ??
        `${pet.name} is currently missing. If you have found ${pet.name}, please contact the owner immediately.`,
      rewardNote: detail?.lostRewardNote ?? "",
      extraContactInstruction: detail?.lostExtraContactInstruction ?? "",
    },
    owner: {
      name:
        contact?.ownerDisplayName ??
        ownerSettings.ownerDisplayName ??
        `${pet.name}'s owner`,
      phone: phone ?? "",
      whatsapp: whatsapp ?? "",
      emergencyContact: contact?.emergencyContactE164 ?? phone ?? whatsapp ?? "",
    },
    contactOverride: {
      useOwnerDefaults: contact?.useOwnerDefaults ?? true,
      ownerDisplayName: contact?.ownerDisplayName ?? undefined,
      phoneNumber: contact?.phoneE164 ?? undefined,
      whatsappNumber: contact?.whatsappE164 ?? undefined,
      generalArea: contact?.generalAreaOverride ?? undefined,
    },
    visibility,
    allergies: [],
    medications: [],
  });
}

function mapBackendPublicProfile(profile: BackendPublicPetProfile): PublicPetProfile {
  const species = normalizeBackendSpecies(profile.species, profile.customSpecies);
  const slug = getSlugFromPublicSlug(profile.publicSlug, profile.publicCode);

  return toPublicProfile(
    normalizePet({
      id: profile.publicCode,
      slug,
      name: profile.name,
      species: species.species,
      customSpecies: species.customSpecies,
      breed: "Not set",
      gender: "Not set",
      color: "Not set",
      ageLabel: "Age unknown",
      birthday: "Not set",
      adoptionDay: "Not set",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generalArea: profile.generalArea ?? "",
      photoInitial: getPetInitial(profile.name),
      photoTone: getPhotoTone(species.species),
      profilePhotoLabel: "",
      coverPhotoLabel: "",
      photoUrl: "",
      coverUrl: "",
      profileTheme: "default",
      lifecycleStatus: profile.lifecycleStatus,
      previousLifecycleStatus:
        profile.lifecycleStatus === "Memorial" ? "Memorial" : "Active",
      memorial: {
        passedAwayDate: "",
        memorialMessage: profile.memorialMessage ?? "",
        showMemorialOnPublicProfile: Boolean(profile.memorialMessage),
      },
      qrStatus: "active",
      publicCode: profile.publicCode,
      safetyCode: "",
      qrSafetyEnabled: true,
      qrSafetyPath: "",
      finderProfileUrl: "",
      publicProfilePath: publicProfilePath(slug, profile.publicCode),
      bio:
        profile.bio ??
        `${profile.name} has a safe MyPetLink profile ready for family and friends.`,
      personalityTags: ["Loved", "Family pet"],
      favoriteFood: "Not set",
      favoriteToy: "Not set",
      safetyNote: "",
      emergencyNote: "",
      lostModeEnabled: profile.lostModeEnabled,
      lostMode: getDefaultLostMode(profile.name, profile.generalArea ?? ""),
      owner: {
        name: profile.ownerDisplayName ?? "",
        phone: "",
        whatsapp: "",
        emergencyContact: "",
      },
      visibility: {
        ...defaultVisibility,
        showOwnerName: Boolean(profile.ownerDisplayName),
        showGeneralArea: Boolean(profile.generalArea),
        showPhone: false,
        showWhatsapp: false,
        showEmergencyNote: false,
      },
      allergies: [],
      medications: [],
    })
  );
}

export function mapBackendSafetyPage(page: BackendPublicSafetyPage): PublicPetProfile {
  const species = normalizeBackendSpecies(page.species);
  const safetyPath = qrSafetyPath(page.safetyCode);
  const slug = slugifyPetSlug(page.name) || "pet";
  const contact = page.contact;
  const phone = contact?.phoneE164 ?? "";
  const whatsapp = contact?.whatsappE164 ?? "";

  return toPublicProfile(
    normalizePet({
      id: page.safetyCode,
      slug,
      name: page.name,
      species: species.species,
      customSpecies: species.customSpecies,
      breed: "Not set",
      gender: "Not set",
      color: "Not set",
      ageLabel: "Age unknown",
      birthday: "Not set",
      adoptionDay: "Not set",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generalArea: page.generalArea ?? "",
      photoInitial: getPetInitial(page.name),
      photoTone: getPhotoTone(species.species),
      profilePhotoLabel: "",
      coverPhotoLabel: "",
      photoUrl: "",
      coverUrl: "",
      profileTheme: "default",
      lifecycleStatus: page.lifecycleStatus,
      previousLifecycleStatus:
        page.lifecycleStatus === "Memorial" ? "Memorial" : "Active",
      memorial: {
        passedAwayDate: "",
        memorialMessage:
          page.lifecycleStatus === "Memorial"
            ? `${page.name} is lovingly remembered.`
            : "",
        showMemorialOnPublicProfile: true,
      },
      qrStatus: "active",
      publicCode: "",
      safetyCode: page.safetyCode,
      qrSafetyEnabled: true,
      qrSafetyPath: safetyPath,
      finderProfileUrl: safetyPath,
      publicProfilePath: "",
      bio: "",
      personalityTags: [],
      favoriteFood: "Not set",
      favoriteToy: "Not set",
      safetyNote: page.safetyNote ?? "",
      emergencyNote: page.emergencyNote ?? "",
      lostModeEnabled: page.lostModeEnabled || page.state === "LostMode",
      lostMode: {
        lastSeenArea: page.lostLastSeenArea ?? page.generalArea ?? "",
        lastSeenDateTime: page.lostLastSeenDateTime ?? "",
        lostMessage: page.lostMessage ?? "",
        rewardNote: page.lostRewardNote ?? "",
        extraContactInstruction: page.lostExtraContactInstruction ?? "",
      },
      owner: {
        name: contact?.ownerDisplayName ?? "",
        phone,
        whatsapp,
        emergencyContact: contact?.emergencyContactE164 ?? phone,
      },
      visibility: {
        ...defaultVisibility,
        showOwnerName: Boolean(contact?.ownerDisplayName),
        showGeneralArea: Boolean(page.generalArea),
        showPhone: Boolean(phone),
        showWhatsapp: Boolean(whatsapp),
        showEmergencyNote: Boolean(page.emergencyNote),
      },
      allergies: [],
      medications: [],
    })
  );
}

function PetDtoFallbackSlug(name: string, publicCode: string) {
  return `${slugifyPetSlug(name) || "pet"}-${publicCode}`;
}

function buildBackendPetPayload(payload: PetPayload) {
  return {
    name: payload.name,
    species: payload.species,
    customSpecies: payload.customSpecies,
    breed: payload.breed,
    gender: payload.gender,
    color: payload.color,
    birthday: toIsoDate(payload.birthday),
    adoptionDay: toIsoDate(payload.adoptionDay),
    generalArea: payload.generalArea,
    bio: payload.bio,
    profileTheme: payload.profileTheme,
    contact: {
      useOwnerDefaults: payload.contactOverride?.useOwnerDefaults ?? true,
      ownerDisplayName:
        payload.contactOverride?.ownerDisplayName ?? payload.owner?.name,
      phoneE164:
        payload.contactOverride?.phoneNumber ?? payload.owner?.phone ?? null,
      whatsappE164:
        payload.contactOverride?.whatsappNumber ??
        payload.owner?.whatsapp ??
        null,
      emergencyContactE164: payload.owner?.emergencyContact ?? null,
      generalAreaOverride:
        payload.contactOverride?.generalArea ?? payload.generalArea ?? null,
    },
    visibility: payload.visibility,
    safetyNote: payload.safetyNote,
    emergencyNote: payload.emergencyNote,
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

// Several dashboard/list widgets call getPets on mount at the same time.
// Sharing the in-flight request collapses those concurrent calls into one
// network fetch; the promise is cleared as soon as it settles, so later
// calls (e.g. after a mutation) always fetch fresh data.
let inFlightPetsRequest: Promise<ApiResponse<Pet[]>> | null = null;

export async function getPets() {
  if (canUseApi()) {
    inFlightPetsRequest ??= (async () => {
      try {
        const response = await apiRequest<BackendPetListItem[]>(
          "/api/v1/pets?lifecycleStatus=All&page=1&pageSize=100"
        );

        return apiResponse(
          {
            data: (response.data ?? []).map(mapBackendPetToFrontend),
            meta: response.meta,
          },
          []
        );
      } finally {
        inFlightPetsRequest = null;
      }
    })();

    return inFlightPetsRequest;
  }

  await mockDelay();
  const pets = getPetCollection();

  return mockResponse(pets, {
    page: 1,
    pageSize: pets.length,
    total: pets.length,
  });
}

export async function getPetById(id: string) {
  if (canUseApi()) {
    try {
      const response = await apiRequest<BackendPetDetail>(
        `/api/v1/pets/${encodeURIComponent(id)}`
      );

      return apiResponse(
        {
          data: response.data
            ? mapBackendPetToFrontend(response.data)
            : null,
          meta: response.meta,
        },
        null
      );
    } catch (error) {
      if (isNotFoundLike(error)) {
        return apiNullResponse<Pet>();
      }

      throw error;
    }
  }

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
    lifecycleStatus: pet.lifecycleStatus,
    previousLifecycleStatus: pet.previousLifecycleStatus,
    memorial: pet.memorial,
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
// /p/{slug}-{publicCode}), never by slug, so renaming a pet never breaks an
// already-shared link.
export async function getPublicPetProfileByPublicCode(publicCode: string) {
  if (canUseApi()) {
    try {
      const response = await apiRequest<BackendPublicPetProfile>(
        `/api/v1/public/pets/${encodeURIComponent(publicCode)}`,
        { auth: false }
      );

      return apiResponse(
        {
          data: response.data
            ? mapBackendPublicProfile(response.data)
            : null,
          meta: response.meta,
        },
        null
      );
    } catch (error) {
      if (isNotFoundLike(error)) {
        return apiNullResponse<PublicPetProfile>();
      }

      throw error;
    }
  }

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
  if (canUseApi()) {
    try {
      const response = await apiRequest<BackendPublicSafetyPage>(
        `/api/v1/public/safety/${encodeURIComponent(safetyCode)}`,
        { auth: false }
      );

      return apiResponse(
        {
          data: response.data ? mapBackendSafetyPage(response.data) : null,
          meta: response.meta,
        },
        null
      );
    } catch (error) {
      if (isNotFoundLike(error)) {
        return apiNullResponse<PublicPetProfile>();
      }

      throw error;
    }
  }

  await mockDelay();
  const normalized = safetyCode.trim().toLowerCase();
  const pet = getPetCollection().find(
    (item) => item.safetyCode.toLowerCase() === normalized
  );

  if (!pet || (isActivePet(pet) && !pet.qrSafetyEnabled)) {
    return mockResponse<PublicPetProfile | null>(null);
  }

  return mockResponse(toPublicProfile(pet));
}

export async function createPet(payload: PetPayload) {
  if (canUseApi()) {
    const response = await apiRequest<BackendPetDetail>("/api/v1/pets", {
      method: "POST",
      body: buildBackendPetPayload(payload),
    });
    const pet = response.data ? mapBackendPetToFrontend(response.data) : null;

    if (!pet) {
      throw new Error("Pet profile was not returned after saving.");
    }

    return apiResponse(
      {
        data: pet,
        meta: response.meta,
      },
      pet
    );
  }

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
    lifecycleStatus: payload.lifecycleStatus ?? "Active",
    previousLifecycleStatus:
      payload.lifecycleStatus === "Memorial" ? "Memorial" : "Active",
    memorial: mergeMemorial(payload.memorial),
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
  if (canUseApi()) {
    try {
      const response = await apiRequest<BackendPetDetail>(
        `/api/v1/pets/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: buildBackendPetPayload(payload),
        }
      );

      return apiResponse(
        {
          data: response.data
            ? mapBackendPetToFrontend(response.data)
            : null,
          meta: response.meta,
        },
        null
      );
    } catch (error) {
      if (isNotFoundLike(error)) {
        return apiNullResponse<Pet>();
      }

      throw error;
    }
  }

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
        lifecycleStatus: payload.lifecycleStatus
          ? normalizeLifecycleStatus(payload.lifecycleStatus)
          : pet.lifecycleStatus,
        previousLifecycleStatus:
          payload.lifecycleStatus === "Archived"
            ? getPreviousLifecycleStatus(pet)
            : payload.lifecycleStatus === "Memorial"
              ? "Memorial"
              : payload.lifecycleStatus === "Active"
                ? "Active"
                : payload.previousLifecycleStatus ?? pet.previousLifecycleStatus,
        memorial: mergeMemorial({
          ...pet.memorial,
          ...payload.memorial,
        }),
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

export function getCountedProfileCount(pets: Pet[]) {
  return getCountedPetProfiles(pets).length;
}

export async function updatePetLifecycle(
  id: string,
  lifecycleStatus: PetLifecycleStatus,
  memorial?: Partial<PetMemorial>
) {
  if (canUseApi()) {
    try {
      if (lifecycleStatus === "Memorial") {
        const response = await apiRequest<BackendPetDetail>(
          `/api/v1/pets/${encodeURIComponent(id)}/mark-memorial`,
          {
            method: "POST",
            body: {
              passedAwayDate: toIsoDate(memorial?.passedAwayDate),
              memorialMessage: memorial?.memorialMessage ?? "",
              showMemorialOnPublicProfile:
                memorial?.showMemorialOnPublicProfile ?? true,
            },
          }
        );

        return apiResponse(
          {
            data: response.data
              ? mapBackendPetToFrontend(response.data)
              : null,
            meta: response.meta,
          },
          null
        );
      }

      const endpoint =
        lifecycleStatus === "Archived" ? "archive" : "restore-active";
      const response = await apiRequest<BackendPetDetail>(
        `/api/v1/pets/${encodeURIComponent(id)}/${endpoint}`,
        { method: "POST" }
      );

      return apiResponse(
        {
          data: response.data ? mapBackendPetToFrontend(response.data) : null,
          meta: response.meta,
        },
        null
      );
    } catch (error) {
      if (isNotFoundLike(error)) {
        return apiNullResponse<Pet>();
      }

      throw error;
    }
  }

  const pet = await getPetById(id);

  if (!pet.data) {
    return mockResponse<Pet | null>(null);
  }

  return updatePet(id, {
    lifecycleStatus,
    previousLifecycleStatus:
      lifecycleStatus === "Archived"
        ? getPreviousLifecycleStatus(pet.data)
        : lifecycleStatus === "Memorial"
          ? "Memorial"
          : pet.data.previousLifecycleStatus,
    memorial: memorial
      ? mergeMemorial({
          ...pet.data.memorial,
          ...memorial,
        })
      : pet.data.memorial,
  });
}

export async function restorePetProfile(id: string) {
  if (canUseApi()) {
    type RestorePetProfileResult = { pet: Pet | null; blockedReason?: string };

    try {
      const response = await apiRequest<BackendPetDetail>(
        `/api/v1/pets/${encodeURIComponent(id)}/restore-active`,
        { method: "POST" }
      );
      const pet = response.data ? mapBackendPetToFrontend(response.data) : null;

      return apiResponse<RestorePetProfileResult>(
        {
          data: { pet },
          meta: response.meta,
        },
        { pet: null }
      );
    } catch (error) {
      if (
        isApiClientError(error) &&
        error.code === "plan_limit_reached"
      ) {
        return apiResponse<RestorePetProfileResult>(
          {
            data: {
              pet: null,
              blockedReason: error.message,
            },
          },
          { pet: null, blockedReason: error.message }
        );
      }

      if (isNotFoundLike(error)) {
        return apiResponse<RestorePetProfileResult>(
          { data: { pet: null } },
          { pet: null }
        );
      }

      throw error;
    }
  }

  await mockDelay();
  const pets = getPetCollection();
  const pet = pets.find((item) => item.id === id);
  type RestorePetProfileResult = { pet: Pet | null; blockedReason?: string };

  if (!pet) {
    return mockResponse<RestorePetProfileResult>({
      pet: null,
    });
  }

  if (!isArchivedPet(pet)) {
    return mockResponse<RestorePetProfileResult>({ pet });
  }

  const countedProfiles = getCountedProfileCount(pets);
  const freeLimit = freePlanLimits.maxPets;

  if (countedProfiles >= freeLimit) {
    return mockResponse<RestorePetProfileResult>({
      pet: null,
      blockedReason:
        "You've reached the Free profile limit. Archive another pet first, or wait for Premium plans for more profiles.",
    });
  }

  const restoredStatus = pet.previousLifecycleStatus || "Active";
  const restoredPet: Pet = normalizePet({
    ...pet,
    lifecycleStatus: restoredStatus,
    previousLifecycleStatus: restoredStatus,
    updatedAt: new Date().toISOString(),
  });

  writeStoredCollection(
    PET_STORAGE_KEY,
    pets.map((item) => (item.id === id ? restoredPet : item))
  );

  return mockResponse<RestorePetProfileResult>({ pet: restoredPet });
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
