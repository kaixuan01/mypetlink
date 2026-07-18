import { buildAdminListQuery, csvCell, triggerDownload } from "@/lib/adminListShared";
import { canUseAdminApi, getAdminData, getOwnerSummaries, getPetsForOwner } from "@/services/adminService";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import { mockDelay } from "@/services/mockApi";
import { isValidE164 } from "@/lib/phone";
import { freePlanLimits } from "@/lib/planLimits";
import type { PetLifecycleStatus, TagStatus } from "@/types";

export type AdminOwnerStatus = "Active" | "Invited" | "Suspended" | "Deleted";

export type AdminOwnerListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  contactReady?: string;
  profileComplete?: string;
  authProvider?: string;
  hasPets?: string;
  petCountMin?: string;
  petCountMax?: string;
  hasActivePet?: string;
  hasArchivedOrMemorialPet?: string;
  hasLostModePet?: string;
  hasOrders?: string;
  orderCountMin?: string;
  orderCountMax?: string;
  hasPendingPayment?: string;
  hasPendingProof?: string;
  hasActiveFulfilment?: string;
  hasDeliveredOrder?: string;
  tagState?: string;
  plan?: string;
  petUsageNearLimit?: string;
  memoryUsageNearLimit?: string;
  joinedFrom?: string;
  joinedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: string;
  sortDir?: string;
};

export type AdminOwner = {
  ownerUserId: string;
  displayName: string;
  email: string;
  status: AdminOwnerStatus;
  planCode: string;
  planName: string;
  profileComplete: boolean;
  contactReady: boolean;
  contactSummary: string;
  finderReadyPetCount: number;
  finderContactIssuePetCount: number;
  petCount: number;
  activePetCount: number;
  memorialPetCount: number;
  archivedPetCount: number;
  lostModePetCount: number;
  orderCount: number;
  pendingPaymentOrderCount: number;
  pendingProofCount: number;
  activeFulfilmentOrderCount: number;
  deliveredOrderCount: number;
  activeSmartTagCount: number;
  totalSmartTagCount: number;
  memoryCount: number;
  maxPets: number;
  maxMemoriesPerPet: number;
  petUsageNearLimit: boolean;
  memoryUsageNearLimit: boolean;
  joinedAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type AdminOwnerCounts = {
  all: number;
  active: number;
  suspended: number;
  missingContact: number;
  noPets: number;
};

export type AdminOwnerPetSummary = {
  petId: string;
  name: string;
  lifecycle: PetLifecycleStatus;
  lostModeEnabled: boolean;
  publicProfileSetupIssue: boolean;
  qrSafetySetupIssue: boolean;
  updatedAt: string;
};

export type AdminOwnerOrderSummary = {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminOwnerPaymentProofSummary = {
  paymentProofId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
};

export type AdminOwnerSmartTagSummary = {
  tagId: string;
  tagCode: string;
  status: TagStatus;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminOwnerHistoryItem = {
  label: string;
  actor: string;
  createdAt: string;
};

export type AdminOwnerDetail = {
  owner: AdminOwner;
  phoneE164?: string;
  whatsappE164?: string;
  defaultGeneralArea?: string;
  defaultPrivacy: {
    showOwnerName: boolean;
    showGeneralArea: boolean;
    showPhone: boolean;
    showWhatsapp: boolean;
    showEmergencyNote: boolean;
    showCareBadges: boolean;
    showMoments: boolean;
    showTimeline: boolean;
    showBirthdayOnTimeline: boolean;
    showAdoptionDayOnTimeline: boolean;
    showHealthSummary: boolean;
    showAllergiesOnPublicProfile: boolean;
  };
  authenticationProviders: string[];
  highestMemoriesOnPet: number;
  memoryUsageNearLimit: boolean;
  pets: AdminOwnerPetSummary[];
  recentOrders: AdminOwnerOrderSummary[];
  recentPaymentProofs: AdminOwnerPaymentProofSummary[];
  smartTags: AdminOwnerSmartTagSummary[];
  history: AdminOwnerHistoryItem[];
};

const emptyCounts: AdminOwnerCounts = { all: 0, active: 0, suspended: 0, missingContact: 0, noPets: 0 };

function buildQuery(params: AdminOwnerListParams, omitPaging = false) {
  return buildAdminListQuery(params, { dateOnlyToKeys: ["joinedTo", "updatedTo"], omitPaging });
}

export async function listAdminOwners(params: AdminOwnerListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminOwner[]>(`/api/v1/admin/owners/table?${buildQuery(params)}`, { signal });
    return { items: response.data ?? [], total: response.meta?.total ?? 0 };
  }
  await mockDelay();
  const rows = sortLocal(filterLocal(await loadLocalRows(), params), params);
  const start = (params.page - 1) * params.pageSize;
  return { items: rows.slice(start, start + params.pageSize), total: rows.length };
}

export async function countAdminOwners(params: AdminOwnerListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminOwnerCounts>(`/api/v1/admin/owners/counts?${buildQuery(params)}`, { signal });
    return response.data ?? emptyCounts;
  }
  await mockDelay();
  const rows = filterLocal(await loadLocalRows(), { ...params, status: undefined });
  return {
    all: rows.length,
    active: rows.filter((row) => row.status === "Active").length,
    suspended: rows.filter((row) => row.status === "Suspended").length,
    missingContact: rows.filter((row) => !row.contactReady).length,
    noPets: rows.filter((row) => row.petCount === 0).length,
  };
}

export async function getAdminOwnerDetail(ownerId: string, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminOwnerDetail>(`/api/v1/admin/owners/${encodeURIComponent(ownerId)}/detail`, { signal });
    if (!response.data) throw new Error("The owner account response was empty.");
    return normalizeDetail(response.data);
  }
  await mockDelay();
  const owners = await loadLocalRows();
  const owner = owners.find((item) => item.ownerUserId === ownerId);
  if (!owner) throw new Error("This owner account could not be found.");
  return {
    owner,
    defaultPrivacy: emptyPrivacy(),
    authenticationProviders: [],
    highestMemoriesOnPet: 0,
    memoryUsageNearLimit: false,
    pets: [],
    recentOrders: [],
    recentPaymentProofs: [],
    smartTags: [],
    history: [{ label: "Owner account available", actor: "Owner", createdAt: owner.joinedAt }],
  } satisfies AdminOwnerDetail;
}

export function getAdminOwnerExportFormats(): ("csv" | "xlsx")[] {
  return canUseAdminApi() ? ["csv", "xlsx"] : ["csv"];
}

export async function downloadAdminOwnersExport(params: AdminOwnerListParams, format: "csv" | "xlsx", selectedIds?: string[]) {
  if (canUseAdminApi()) {
    const query = new URLSearchParams(buildQuery(params, true));
    query.set("format", format);
    if (selectedIds?.length) query.set("ids", selectedIds.join(","));
    const { blob, fileName } = await apiRequestBlob(`/api/v1/admin/owners/export?${query}`);
    triggerDownload(blob, fileName ?? `mypetlink-owners.${format}`);
    return;
  }
  await mockDelay();
  let rows = sortLocal(filterLocal(await loadLocalRows(), params), params);
  if (selectedIds?.length) {
    const selected = new Set(selectedIds);
    rows = rows.filter((row) => selected.has(row.ownerUserId));
  }
  const data = [
    ["Owner Name", "Email", "Contact Ready", "Account Status", "Plan", "Pet Count", "Order Count", "Active Smart Tag Count", "Joined At", "Updated At"],
    ...rows.map((row) => [row.displayName, row.email, row.contactReady ? "Yes" : "No", row.status, row.planCode, String(row.petCount), String(row.orderCount), String(row.activeSmartTagCount), row.joinedAt, row.updatedAt]),
  ];
  const csv = data.map((row) => row.map(csvCell).join(",")).join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mypetlink-owners.csv");
}

function normalizeDetail(detail: AdminOwnerDetail): AdminOwnerDetail {
  return {
    ...detail,
    phoneE164: detail.phoneE164 ?? undefined,
    whatsappE164: detail.whatsappE164 ?? undefined,
    defaultGeneralArea: detail.defaultGeneralArea ?? undefined,
    authenticationProviders: detail.authenticationProviders ?? [],
    pets: detail.pets ?? [],
    recentOrders: detail.recentOrders ?? [],
    recentPaymentProofs: (detail.recentPaymentProofs ?? []).map((proof) => ({ ...proof, reviewedAt: proof.reviewedAt ?? undefined })),
    smartTags: (detail.smartTags ?? []).map((tag) => ({
      ...tag,
      status: String(tag.status) === "Unclaimed" ? "Unassigned" : tag.status,
    })),
    history: detail.history ?? [],
  };
}

async function loadLocalRows() {
  const [{ mockUsers }, summaries, data] = await Promise.all([
    import("@/data/mockUsers"),
    getOwnerSummaries(),
    getAdminData(),
  ]);
  return summaries.map((summary): AdminOwner => {
    const user = mockUsers.find((item) => item.id === summary.user.id) ?? summary.user;
    const pets = getPetsForOwner(user, data.pets, mockUsers);
    const petIds = new Set(pets.map((pet) => pet.id));
    const orders = data.orders.filter((order) => petIds.has(order.petId));
    const tags = data.tags.filter((tag) => petIds.has(tag.petId ?? ""));
    const phoneReady = isValidE164(summary.phone);
    const whatsappReady = isValidE164(summary.whatsapp);
    const contactReady = phoneReady || whatsappReady;
    const preferred = phoneReady ? summary.phone : whatsappReady ? summary.whatsapp : "";
    const finderReadyPetCount = pets.filter((pet) =>
      pet.qrSafetyEnabled
      && ((pet.visibility.showPhone && isValidE164(pet.owner.phone))
        || (pet.visibility.showWhatsapp && isValidE164(pet.owner.whatsapp))))
      .length;
    const qrEnabledPetCount = pets.filter((pet) => pet.qrSafetyEnabled).length;
    const activePetCount = pets.filter((pet) => pet.lifecycleStatus === "Active").length;
    return {
      ownerUserId: user.id,
      displayName: user.name,
      email: user.email,
      status: user.status === "active" ? "Active" : user.status === "invited" ? "Invited" : "Suspended",
      planCode: "Free",
      planName: "Free",
      profileComplete: contactReady,
      contactReady,
      contactSummary: preferred ? `${phoneReady && whatsappReady ? "Phone and WhatsApp" : phoneReady ? "Phone" : "WhatsApp"} · ${maskPhone(preferred)}` : "No usable contact",
      finderReadyPetCount,
      finderContactIssuePetCount: Math.max(0, qrEnabledPetCount - finderReadyPetCount),
      petCount: pets.length,
      activePetCount,
      memorialPetCount: pets.filter((pet) => pet.lifecycleStatus === "Memorial").length,
      archivedPetCount: pets.filter((pet) => pet.lifecycleStatus === "Archived").length,
      lostModePetCount: pets.filter((pet) => pet.lostModeEnabled).length,
      orderCount: orders.length,
      pendingPaymentOrderCount: orders.filter((order) => order.status === "Pending Payment").length,
      pendingProofCount: orders.filter((order) => order.status === "Payment Submitted").length,
      activeFulfilmentOrderCount: orders.filter((order) => ["Payment Confirmed", "Preparing Tag", "Shipped"].includes(order.status)).length,
      deliveredOrderCount: orders.filter((order) => order.status === "Delivered").length,
      activeSmartTagCount: tags.filter((tag) => tag.status === "Active").length,
      totalSmartTagCount: tags.length,
      memoryCount: 0,
      maxPets: freePlanLimits.maxPets,
      maxMemoriesPerPet: freePlanLimits.maxMemoriesPerPet,
      petUsageNearLimit: activePetCount >= Math.max(0, freePlanLimits.maxPets - 1),
      memoryUsageNearLimit: false,
      joinedAt: toIso(user.joinedAt),
      updatedAt: toIso(user.joinedAt),
    };
  });
}

function filterLocal(rows: AdminOwner[], params: AdminOwnerListParams) {
  const search = params.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (search && !`${row.displayName} ${row.email}`.toLowerCase().includes(search)) return false;
    if (params.status && row.status !== params.status) return false;
    if (params.contactReady && row.contactReady !== (params.contactReady === "true")) return false;
    if (params.profileComplete && row.profileComplete !== (params.profileComplete === "true")) return false;
    if (params.hasPets && (row.petCount > 0) !== (params.hasPets === "true")) return false;
    if (params.hasOrders && (row.orderCount > 0) !== (params.hasOrders === "true")) return false;
    if (params.plan && row.planCode !== params.plan) return false;
    if (params.petUsageNearLimit && row.petUsageNearLimit !== (params.petUsageNearLimit === "true")) return false;
    if (params.memoryUsageNearLimit && row.memoryUsageNearLimit !== (params.memoryUsageNearLimit === "true")) return false;
    if (params.tagState === "none" && row.totalSmartTagCount !== 0) return false;
    if (params.tagState === "any" && row.totalSmartTagCount === 0) return false;
    if (params.tagState === "active" && row.activeSmartTagCount === 0) return false;
    return inRange(row.joinedAt, params.joinedFrom, params.joinedTo) && inRange(row.updatedAt, params.updatedFrom, params.updatedTo);
  });
}

function sortLocal(rows: AdminOwner[], params: AdminOwnerListParams) {
  const field = params.sortBy ?? "joinedAt";
  const direction = params.sortDir === "asc" ? 1 : -1;
  const value = (row: AdminOwner) => field === "name" ? row.displayName
    : field === "activeTagCount" ? row.activeSmartTagCount
      : String((row as unknown as Record<string, unknown>)[field] ?? "");
  return [...rows].sort((left, right) => String(value(left)).localeCompare(String(value(right))) * direction || left.ownerUserId.localeCompare(right.ownerUserId));
}

function inRange(value: string, from?: string, to?: string) {
  const time = Date.parse(value);
  return (!from || time >= Date.parse(from)) && (!to || time <= Date.parse(to.length === 10 ? `${to}T23:59:59Z` : to));
}

function maskPhone(value: string) {
  return value.length > 7 ? `${value.slice(0, 3)} •••• ${value.slice(-4)}` : "••••";
}



function toIso(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}


function emptyPrivacy() {
  return {
    showOwnerName: false,
    showGeneralArea: false,
    showPhone: false,
    showWhatsapp: false,
    showEmergencyNote: false,
    showCareBadges: false,
    showMoments: false,
    showTimeline: false,
    showBirthdayOnTimeline: false,
    showAdoptionDayOnTimeline: false,
    showHealthSummary: false,
    showAllergiesOnPublicProfile: false,
  };
}
