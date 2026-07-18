import { buildAdminListQuery, csvCell, triggerDownload } from "@/lib/adminListShared";
import { canUseAdminApi } from "@/services/adminService";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import { mockDelay } from "@/services/mockApi";
import { getPetById, getPets } from "@/services/petService";
import { readAdminTagCollection } from "@/services/tagService";
import type { Pet, PetLifecycleStatus, TagStatus, TagVariant } from "@/types";

export type AdminPetProfileListParams = {
  page: number;
  pageSize: number;
  search?: string;
  view?: string;
  lifecycle?: string;
  lostMode?: string;
  hasLastSeen?: string;
  petType?: string;
  breed?: string;
  gender?: string;
  ageMode?: string;
  publicProfile?: string;
  showAllergiesPublicly?: string;
  profileTheme?: string;
  hasProfilePhoto?: string;
  hasCoverPhoto?: string;
  qrSafety?: string;
  hasFinderContact?: string;
  hasAllergies?: string;
  hasEmergencyNote?: string;
  tagState?: string;
  tagType?: string;
  ownerId?: string;
  owner?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: string;
  sortDir?: string;
};

export type AdminPetProfile = {
  id: string;
  name: string;
  species: string;
  customSpecies?: string;
  breed?: string;
  gender?: string;
  ageMode: string;
  ageDisplay: string;
  profilePhotoUrl?: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  lifecycle: PetLifecycleStatus;
  lostModeEnabled: boolean;
  lostLastSeenDateTime?: string;
  publicProfileEnabled: boolean;
  publicProfileAccessible: boolean;
  publicProfileSetupIssue: boolean;
  publicSlug?: string;
  publicCode?: string;
  profileTheme: string;
  qrSafetyEnabled: boolean;
  qrSafetyAccessible: boolean;
  qrSafetySetupIssue: boolean;
  safetyCode?: string;
  hasFinderContact: boolean;
  hasAllergies: boolean;
  showAllergiesPublicly: boolean;
  activeSmartTagCount: number;
  totalSmartTagCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminPetProfileCounts = {
  all: number;
  active: number;
  lostMode: number;
  memorial: number;
  archived: number;
};

export type AdminPetTagSummary = {
  id: string;
  tagCode: string;
  hasNfc: boolean;
  variant: TagVariant;
  status: TagStatus;
  isArchived: boolean;
  activatedAt?: string;
  lastScannedAt?: string;
};

export type AdminPetHistoryItem = {
  action: string;
  actorType: string;
  actorName?: string;
  detail?: string;
  createdAt: string;
};

export type AdminPetProfileDetail = {
  pet: AdminPetProfile;
  color?: string;
  birthday?: string;
  estimatedBirthYear?: number;
  adoptionDay?: string;
  coverPhotoUrl?: string;
  generalArea?: string;
  ownerPhone?: string;
  ownerWhatsapp?: string;
  finderOwnerName?: string;
  finderPhone?: string;
  finderWhatsapp?: string;
  emergencyContact?: string;
  showOwnerName: boolean;
  showGeneralArea: boolean;
  showPhone: boolean;
  showWhatsapp: boolean;
  showEmergencyNote: boolean;
  showHealthSummary: boolean;
  showAllergiesOnPublicProfile: boolean;
  allergies: string[];
  safetyNote?: string;
  emergencyNote?: string;
  lostLastSeenArea?: string;
  lostMessage?: string;
  lostRewardNote?: string;
  lostContactInstructions?: string;
  memorialPassedAwayDate?: string;
  memorialMessage?: string;
  showMemorialOnPublicProfile: boolean;
  smartTags: AdminPetTagSummary[];
  history: AdminPetHistoryItem[];
};

type BackendPetProfile = Omit<
  AdminPetProfile,
  "ownerId" | "lifecycle"
> & {
  ownerUserId: string;
  lifecycle: string;
};

type BackendDetail = Omit<AdminPetProfileDetail, "pet"> & {
  pet: BackendPetProfile;
};

const emptyCounts: AdminPetProfileCounts = {
  all: 0,
  active: 0,
  lostMode: 0,
  memorial: 0,
  archived: 0,
};

function mapPet(item: BackendPetProfile): AdminPetProfile {
  return {
    ...item,
    ownerId: item.ownerUserId,
    lifecycle: item.lifecycle as PetLifecycleStatus,
    customSpecies: item.customSpecies ?? undefined,
    breed: item.breed ?? undefined,
    gender: item.gender ?? undefined,
    profilePhotoUrl: item.profilePhotoUrl ?? undefined,
    lostLastSeenDateTime: item.lostLastSeenDateTime ?? undefined,
    publicSlug: item.publicSlug ?? undefined,
    publicCode: item.publicCode ?? undefined,
    safetyCode: item.safetyCode ?? undefined,
  };
}

function mapDetail(item: BackendDetail): AdminPetProfileDetail {
  return {
    ...item,
    pet: mapPet(item.pet),
    color: item.color ?? undefined,
    birthday: item.birthday ?? undefined,
    estimatedBirthYear: item.estimatedBirthYear ?? undefined,
    adoptionDay: item.adoptionDay ?? undefined,
    coverPhotoUrl: item.coverPhotoUrl ?? undefined,
    generalArea: item.generalArea ?? undefined,
    ownerPhone: item.ownerPhone ?? undefined,
    ownerWhatsapp: item.ownerWhatsapp ?? undefined,
    finderOwnerName: item.finderOwnerName ?? undefined,
    finderPhone: item.finderPhone ?? undefined,
    finderWhatsapp: item.finderWhatsapp ?? undefined,
    emergencyContact: item.emergencyContact ?? undefined,
    safetyNote: item.safetyNote ?? undefined,
    emergencyNote: item.emergencyNote ?? undefined,
    lostLastSeenArea: item.lostLastSeenArea ?? undefined,
    lostMessage: item.lostMessage ?? undefined,
    lostRewardNote: item.lostRewardNote ?? undefined,
    lostContactInstructions: item.lostContactInstructions ?? undefined,
    memorialPassedAwayDate: item.memorialPassedAwayDate ?? undefined,
    memorialMessage: item.memorialMessage ?? undefined,
    smartTags: (item.smartTags ?? []).map((tag) => ({
      ...tag,
      status: String(tag.status) === "Unclaimed" ? "Unassigned" : tag.status,
      activatedAt: tag.activatedAt ?? undefined,
      lastScannedAt: tag.lastScannedAt ?? undefined,
    })),
    history: (item.history ?? []).map((entry) => ({
      ...entry,
      actorName: entry.actorName ?? undefined,
      detail: entry.detail ?? undefined,
    })),
  };
}

function buildQuery(params: AdminPetProfileListParams, omitPaging = false) {
  return buildAdminListQuery(params, { dateOnlyToKeys: ["createdTo", "updatedTo"], omitPaging });
}

export async function listAdminPetProfiles(params: AdminPetProfileListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendPetProfile[]>(`/api/v1/admin/pets/table?${buildQuery(params)}`, { signal });
    return { items: (response.data ?? []).map(mapPet), total: response.meta?.total ?? 0 };
  }

  await mockDelay();
  const rows = sortLocal(filterLocal(await loadLocalRows(), params), params);
  const start = (params.page - 1) * params.pageSize;
  return { items: rows.slice(start, start + params.pageSize), total: rows.length };
}

export async function countAdminPetProfiles(params: AdminPetProfileListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminPetProfileCounts>(`/api/v1/admin/pets/counts?${buildQuery(params)}`, { signal });
    return response.data ?? emptyCounts;
  }

  await mockDelay();
  const rows = filterLocal(await loadLocalRows(), { ...params, view: undefined });
  return countsFor(rows);
}

export async function getAdminPetProfileDetail(petId: string, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendDetail>(`/api/v1/admin/pets/${encodeURIComponent(petId)}/detail`, { signal });
    if (!response.data) throw new Error("The pet profile response was empty.");
    return mapDetail(response.data);
  }

  await mockDelay();
  const response = await getPetById(petId);
  const pet = response.data;
  if (!pet) throw new Error("This pet profile could not be found.");
  const summary = localPet(pet, readAdminTagCollection());
  return {
    pet: summary,
    color: pet.color,
    birthday: pet.birthday || undefined,
    estimatedBirthYear: pet.estimatedBirthYear,
    adoptionDay: pet.adoptionDay || undefined,
    coverPhotoUrl: pet.coverUrl || undefined,
    generalArea: pet.generalArea || undefined,
    ownerPhone: pet.owner.phone || undefined,
    ownerWhatsapp: pet.owner.whatsapp || undefined,
    finderOwnerName: pet.owner.name || undefined,
    finderPhone: pet.visibility.showPhone ? pet.owner.phone || undefined : undefined,
    finderWhatsapp: pet.visibility.showWhatsapp ? pet.owner.whatsapp || undefined : undefined,
    emergencyContact: pet.visibility.showPhone ? pet.owner.emergencyContact || undefined : undefined,
    showOwnerName: pet.visibility.showOwnerName,
    showGeneralArea: pet.visibility.showGeneralArea,
    showPhone: pet.visibility.showPhone,
    showWhatsapp: pet.visibility.showWhatsapp,
    showEmergencyNote: pet.visibility.showEmergencyNote,
    showHealthSummary: pet.visibility.showHealthSummary,
    showAllergiesOnPublicProfile: pet.visibility.showAllergiesOnPublicProfile,
    allergies: pet.allergies,
    safetyNote: pet.safetyNote || undefined,
    emergencyNote: pet.emergencyNote || undefined,
    lostLastSeenArea: pet.lostMode.lastSeenArea || undefined,
    lostMessage: pet.lostMode.lostMessage || undefined,
    lostRewardNote: pet.lostMode.rewardNote || undefined,
    lostContactInstructions: pet.lostMode.extraContactInstruction || undefined,
    memorialPassedAwayDate: pet.memorial.passedAwayDate || undefined,
    memorialMessage: pet.memorial.memorialMessage || undefined,
    showMemorialOnPublicProfile: pet.memorial.showMemorialOnPublicProfile,
    smartTags: readAdminTagCollection().filter((tag) => tag.petId === pet.id).map((tag) => ({
      id: tag.id,
      tagCode: tag.tagCode,
      hasNfc: tag.hasNfc,
      variant: tag.variant,
      status: tag.status,
      isArchived: Boolean(tag.isArchived),
      activatedAt: tag.activatedAt,
      lastScannedAt: tag.lastScannedAt,
    })),
    history: [],
  };
}

export function getAdminPetProfileExportFormats(): ("csv" | "xlsx")[] {
  return canUseAdminApi() ? ["csv", "xlsx"] : ["csv"];
}

export async function downloadAdminPetProfilesExport(
  params: AdminPetProfileListParams,
  format: "csv" | "xlsx",
  selectedIds?: string[]
) {
  if (canUseAdminApi()) {
    const query = new URLSearchParams(buildQuery(params, true));
    query.set("format", format);
    if (selectedIds?.length) query.set("ids", selectedIds.join(","));
    const { blob, fileName } = await apiRequestBlob(`/api/v1/admin/pets/export?${query}`);
    triggerDownload(blob, fileName ?? `mypetlink-pet-profiles.${format}`);
    return;
  }

  await mockDelay();
  let rows = sortLocal(filterLocal(await loadLocalRows(), params), params);
  if (selectedIds?.length) {
    const selected = new Set(selectedIds);
    rows = rows.filter((row) => selected.has(row.id));
  }
  const data = [
    ["Pet Name", "Owner Name", "Pet Type", "Breed", "Lifecycle", "Lost Mode", "Public Profile Status", "Safety Profile Status", "Active Smart Tags", "Total Smart Tags", "Allergies Present", "Created", "Updated"],
    ...rows.map((row) => [row.name, row.ownerName, row.customSpecies || row.species, row.breed ?? "", row.lifecycle,
      row.lostModeEnabled ? "On" : "Off", routeStatus(row.publicProfileAccessible, row.publicProfileSetupIssue),
      routeStatus(row.qrSafetyAccessible, row.qrSafetySetupIssue), String(row.activeSmartTagCount),
      String(row.totalSmartTagCount), row.hasAllergies ? "Yes" : "No", row.createdAt, row.updatedAt]),
  ];
  const csv = data.map((row) => row.map(csvCell).join(",")).join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mypetlink-pet-profiles.csv");
}


async function loadLocalRows() {
  const response = await getPets();
  const tags = readAdminTagCollection();
  return (response.data ?? []).map((pet) => localPet(pet, tags));
}

function localPet(pet: Pet, tags: ReturnType<typeof readAdminTagCollection>): AdminPetProfile {
  const linked = tags.filter((tag) => tag.petId === pet.id && !tag.isArchived);
  const publicAccessible = Boolean(pet.publicCode && pet.slug)
    && pet.lifecycleStatus !== "Archived"
    && (pet.lifecycleStatus !== "Memorial" || pet.memorial.showMemorialOnPublicProfile);
  const qrAccessible = Boolean(pet.safetyCode && pet.qrSafetyEnabled && pet.lifecycleStatus !== "Archived");
  const publicIssue = pet.lifecycleStatus === "Archived" && Boolean(pet.publicCode);
  const qrIssue = pet.qrSafetyEnabled && (!pet.safetyCode || pet.lifecycleStatus === "Archived");
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    customSpecies: pet.customSpecies,
    breed: pet.breed,
    gender: pet.gender,
    ageMode: pet.birthday ? "Exact birthday" : pet.estimatedBirthYear ? "Estimated birth year" : "Unknown",
    ageDisplay: pet.ageLabel,
    profilePhotoUrl: pet.photoUrl || undefined,
    ownerId: pet.ownerUserId ?? "",
    ownerName: pet.owner.name,
    ownerEmail: "",
    lifecycle: pet.lifecycleStatus,
    lostModeEnabled: pet.lifecycleStatus === "Active" && pet.lostModeEnabled,
    lostLastSeenDateTime: pet.lostMode.lastSeenDateTime || undefined,
    publicProfileEnabled: Boolean(pet.publicCode),
    publicProfileAccessible: publicAccessible,
    publicProfileSetupIssue: publicIssue,
    publicSlug: pet.slug || undefined,
    publicCode: pet.publicCode || undefined,
    profileTheme: pet.profileTheme,
    qrSafetyEnabled: pet.qrSafetyEnabled,
    qrSafetyAccessible: qrAccessible,
    qrSafetySetupIssue: qrIssue,
    safetyCode: pet.safetyCode || undefined,
    hasFinderContact: Boolean((pet.visibility.showPhone && pet.owner.phone) || (pet.visibility.showWhatsapp && pet.owner.whatsapp)),
    hasAllergies: pet.allergies.length > 0,
    showAllergiesPublicly: pet.visibility.showAllergiesOnPublicProfile,
    activeSmartTagCount: linked.filter((tag) => tag.status === "Active").length,
    totalSmartTagCount: tags.filter((tag) => tag.petId === pet.id).length,
    createdAt: pet.createdAt,
    updatedAt: pet.updatedAt,
  };
}

function filterLocal(rows: AdminPetProfile[], params: AdminPetProfileListParams) {
  const search = params.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (search && ![row.name, row.species, row.customSpecies, row.breed, row.ownerName, row.ownerEmail, row.publicSlug, row.publicCode, row.safetyCode]
      .some((value) => value?.toLowerCase().includes(search))) return false;
    if (params.view === "active" && row.lifecycle !== "Active") return false;
    if (params.view === "lost-mode" && !(row.lifecycle === "Active" && row.lostModeEnabled)) return false;
    if (params.view === "memorial" && row.lifecycle !== "Memorial") return false;
    if (params.view === "archived" && row.lifecycle !== "Archived") return false;
    if (params.lifecycle && row.lifecycle !== params.lifecycle) return false;
    if (params.lostMode && row.lostModeEnabled !== (params.lostMode === "true")) return false;
    if (params.petType && ![row.species, row.customSpecies].includes(params.petType)) return false;
    if (params.breed && !row.breed?.toLowerCase().includes(params.breed.toLowerCase())) return false;
    if (params.publicProfile && routeStatusValue(row.publicProfileAccessible, row.publicProfileSetupIssue) !== params.publicProfile) return false;
    if (params.qrSafety && routeStatusValue(row.qrSafetyAccessible, row.qrSafetySetupIssue) !== params.qrSafety) return false;
    if (params.hasAllergies && row.hasAllergies !== (params.hasAllergies === "true")) return false;
    if (params.ownerId && row.ownerId !== params.ownerId) return false;
    if (params.owner && ![row.ownerName, row.ownerEmail].some((value) => value.toLowerCase().includes(params.owner!.toLowerCase()))) return false;
    if (params.tagState === "none" && row.totalSmartTagCount !== 0) return false;
    if (params.tagState === "any" && row.totalSmartTagCount === 0) return false;
    if (params.tagState === "active" && row.activeSmartTagCount === 0) return false;
    if (params.tagState === "inactive-only" && (row.totalSmartTagCount === 0 || row.activeSmartTagCount > 0)) return false;
    return inRange(row.createdAt, params.createdFrom, params.createdTo) && inRange(row.updatedAt, params.updatedFrom, params.updatedTo);
  });
}

function sortLocal(rows: AdminPetProfile[], params: AdminPetProfileListParams) {
  const key = params.sortBy ?? "updatedAt";
  const direction = params.sortDir === "asc" ? 1 : -1;
  const value = (row: AdminPetProfile) => key === "petType" ? row.species
    : key === "smartTagCount" ? row.totalSmartTagCount
      : key === "owner" ? row.ownerName
        : key === "lostMode" ? String(row.lostModeEnabled)
          : key === "lastSeenAt" ? row.lostLastSeenDateTime ?? ""
            : String((row as unknown as Record<string, unknown>)[key] ?? "");
  return [...rows].sort((left, right) => String(value(left)).localeCompare(String(value(right))) * direction || left.id.localeCompare(right.id));
}

function countsFor(rows: AdminPetProfile[]): AdminPetProfileCounts {
  return {
    all: rows.length,
    active: rows.filter((row) => row.lifecycle === "Active").length,
    lostMode: rows.filter((row) => row.lifecycle === "Active" && row.lostModeEnabled).length,
    memorial: rows.filter((row) => row.lifecycle === "Memorial").length,
    archived: rows.filter((row) => row.lifecycle === "Archived").length,
  };
}

function inRange(value: string, from?: string, to?: string) {
  const time = Date.parse(value);
  return (!from || time >= Date.parse(from)) && (!to || time <= Date.parse(to.length === 10 ? `${to}T23:59:59Z` : to));
}

function routeStatusValue(accessible: boolean, issue: boolean) {
  return issue ? "setup-issue" : accessible ? "accessible" : "unavailable";
}

function routeStatus(accessible: boolean, issue: boolean) {
  return issue ? "Setup issue" : accessible ? "Accessible" : "Unavailable";
}
