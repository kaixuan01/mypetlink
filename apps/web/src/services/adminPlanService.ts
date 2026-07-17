import { freePlanLimits, premiumPlan } from "@/lib/planLimits";
import { canUseAdminApi, getAdminData, getOwnerSummaries, getPetsForOwner } from "@/services/adminService";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import { mockDelay } from "@/services/mockApi";
import { getPetMoments } from "@/services/momentService";

// Admin Plans data access. Plan definitions are read-only configuration; the
// owner-plan list shows each owner's assigned plan and usage against its
// limits. There is no subscription billing yet, so nothing here exposes
// billing status, renewal dates, or providers. On local data the same
// operations run over the stored demo collections.

export type AdminPlanDefinition = {
  id: string;
  code: string;
  name: string;
  status: string;
  isArchived: boolean;
  priceLabel: string;
  billingNote?: string;
  description?: string;
  maxPets: number;
  maxMemoriesPerPet: number;
  maxMediaPerMemory: number;
  maxFamilyMembers: number;
  maxCareRecords: number;
  scanHistoryDays: number;
  allowsSmartTagAddOns: boolean;
  allowsFoundReports: boolean;
  allowsAdvancedThemes: boolean;
  ownerCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminUsageState = "Within" | "Near" | "At" | "Over";

export type AdminOwnerPlan = {
  ownerUserId: string;
  displayName: string;
  email: string;
  planCode: string;
  planName: string;
  planStatus: string;
  petCount: number;
  activePetCount: number;
  maxPets: number;
  petUsageState: AdminUsageState;
  totalMemoryCount: number;
  highestMemoriesOnPet: number;
  maxMemoriesPerPet: number;
  memoryUsageState: AdminUsageState;
  careRecordCount: number;
  maxCareRecords: number;
  hasOverride: boolean;
  grandfathered: boolean;
  assignedAt: string;
  updatedAt: string;
};

export type AdminOwnerPlanCounts = {
  all: number;
  nearPetLimit: number;
  atPetLimit: number;
  overPetLimit: number;
  withOverride: number;
};

export type AdminOwnerPlanHistoryItem = {
  label: string;
  actor: string;
  createdAt: string;
};

export type AdminOwnerPlanDetail = {
  item: AdminOwnerPlan;
  plan: AdminPlanDefinition;
  memorialPetCount: number;
  archivedPetCount: number;
  readyMediaFileCount: number;
  readyMediaStorageBytes: number;
  overrideNotes?: string;
  grandfatheredAt?: string;
  history: AdminOwnerPlanHistoryItem[];
};

export type AdminOwnerPlanListParams = {
  page: number;
  pageSize: number;
  search?: string;
  plan?: string;
  petUsage?: string;
  memoryUsage?: string;
  hasOverride?: string;
  assignedFrom?: string;
  assignedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: string;
  sortDir?: string;
};

export const usageStateLabels: Record<AdminUsageState, string> = {
  Within: "Within limit",
  Near: "Near limit",
  At: "At limit",
  Over: "Over limit",
};

export const planStatusLabels: Record<string, string> = {
  Available: "Available",
  ComingSoon: "Coming Soon",
  Disabled: "Disabled",
};

// Shared usage-state derivation matching the service: near starts at 80% of
// the limit; a missing limit falls back safely to Within.
export function deriveUsageState(used: number, limit: number): AdminUsageState {
  if (limit <= 0) return "Within";
  if (used > limit) return "Over";
  if (used === limit) return "At";
  return used * 10 >= limit * 8 ? "Near" : "Within";
}

const emptyCounts: AdminOwnerPlanCounts = {
  all: 0,
  nearPetLimit: 0,
  atPetLimit: 0,
  overPetLimit: 0,
  withOverride: 0,
};

function buildQuery(params: AdminOwnerPlanListParams, omitPaging = false) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && (!omitPaging || (key !== "page" && key !== "pageSize"))) {
      query.set(key, String(value));
    }
  }

  for (const key of ["assignedTo", "updatedTo"] as const) {
    const value = query.get(key);

    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      query.set(key, `${value}T23:59:59Z`);
    }
  }

  return query.toString();
}

// --- Plan definitions ---------------------------------------------------------

export async function listAdminPlanDefinitions(signal?: AbortSignal): Promise<AdminPlanDefinition[]> {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminPlanDefinition[]>("/api/v1/admin/plans", { signal });
    return (response.data ?? []).map((definition) => ({
      ...definition,
      billingNote: definition.billingNote ?? undefined,
      description: definition.description ?? undefined,
    }));
  }

  await mockDelay();
  const owners = await loadLocalRows();
  return localPlanDefinitions(owners.length);
}

// --- Owner plans ---------------------------------------------------------------

export async function listAdminOwnerPlans(params: AdminOwnerPlanListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminOwnerPlan[]>(
      `/api/v1/admin/plans/owners?${buildQuery(params)}`,
      { signal }
    );
    return { items: response.data ?? [], total: response.meta?.total ?? 0 };
  }

  await mockDelay();
  const rows = sortLocal(filterLocal(await loadLocalRows(), params), params);
  const start = (params.page - 1) * params.pageSize;
  return { items: rows.slice(start, start + params.pageSize), total: rows.length };
}

export async function countAdminOwnerPlans(params: AdminOwnerPlanListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminOwnerPlanCounts>(
      `/api/v1/admin/plans/owners/counts?${buildQuery(params)}`,
      { signal }
    );
    return response.data ?? emptyCounts;
  }

  await mockDelay();
  const rows = filterLocal(await loadLocalRows(), params);
  return {
    all: rows.length,
    nearPetLimit: rows.filter((row) => row.petUsageState === "Near").length,
    atPetLimit: rows.filter((row) => row.petUsageState === "At").length,
    overPetLimit: rows.filter((row) => row.petUsageState === "Over").length,
    withOverride: rows.filter((row) => row.hasOverride || row.grandfathered).length,
  };
}

export async function getAdminOwnerPlanDetail(ownerId: string, signal?: AbortSignal): Promise<AdminOwnerPlanDetail> {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminOwnerPlanDetail>(
      `/api/v1/admin/plans/owners/${encodeURIComponent(ownerId)}/detail`,
      { signal }
    );

    if (!response.data) {
      throw new Error("The owner plan response was empty.");
    }

    return {
      ...response.data,
      overrideNotes: response.data.overrideNotes ?? undefined,
      grandfatheredAt: response.data.grandfatheredAt ?? undefined,
      history: response.data.history ?? [],
    };
  }

  await mockDelay();
  const rows = await loadLocalRows();
  const item = rows.find((row) => row.ownerUserId === ownerId);

  if (!item) {
    throw new Error("This owner plan record could not be found.");
  }

  return {
    item,
    plan: localPlanDefinitions(rows.length)[0],
    memorialPetCount: 0,
    archivedPetCount: item.petCount - item.activePetCount,
    readyMediaFileCount: 0,
    readyMediaStorageBytes: 0,
    history: [{ label: `${item.planName} assigned`, actor: "System", createdAt: item.assignedAt }],
  };
}

export function getAdminOwnerPlanExportFormats(): ("csv" | "xlsx")[] {
  return canUseAdminApi() ? ["csv", "xlsx"] : ["csv"];
}

export async function downloadAdminOwnerPlansExport(
  params: AdminOwnerPlanListParams,
  format: "csv" | "xlsx",
  selectedIds?: string[]
) {
  if (canUseAdminApi()) {
    const query = new URLSearchParams(buildQuery(params, true));
    query.set("format", format);

    if (selectedIds?.length) {
      query.set("ids", selectedIds.join(","));
    }

    const { blob, fileName } = await apiRequestBlob(`/api/v1/admin/plans/owners/export?${query}`);
    triggerDownload(blob, fileName ?? `mypetlink-owner-plans.${format}`);
    return;
  }

  await mockDelay();
  let rows = sortLocal(filterLocal(await loadLocalRows(), params), params);

  if (selectedIds?.length) {
    const selected = new Set(selectedIds);
    rows = rows.filter((row) => selected.has(row.ownerUserId));
  }

  const data = [
    [
      "Owner Name", "Owner Email", "Plan", "Plan Status", "Assignment",
      "Active Pets", "Pet Limit", "Pet Usage",
      "Memories (Busiest Pet)", "Memory Limit", "Memory Usage",
      "Manual Override", "Effective Date", "Updated At",
    ],
    ...rows.map((row) => [
      row.displayName, row.email, row.planName, planStatusLabels[row.planStatus] ?? row.planStatus, "Assigned",
      String(row.activePetCount), String(row.maxPets), usageStateLabels[row.petUsageState],
      String(row.highestMemoriesOnPet), String(row.maxMemoriesPerPet), usageStateLabels[row.memoryUsageState],
      row.hasOverride || row.grandfathered ? "Yes" : "No",
      row.assignedAt, row.updatedAt,
    ]),
  ];
  const csv = data.map((row) => row.map(csvCell).join(",")).join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mypetlink-owner-plans.csv");
}

// --- Local-data implementation ---------------------------------------------------

function localPlanDefinitions(freeOwnerCount: number): AdminPlanDefinition[] {
  return [
    {
      id: "plan_free",
      code: "Free",
      name: `${freePlanLimits.planName} Plan`,
      status: "Available",
      isArchived: false,
      priceLabel: "RM0",
      billingNote: "Available now",
      maxPets: freePlanLimits.maxPets,
      maxMemoriesPerPet: freePlanLimits.maxMemoriesPerPet,
      maxMediaPerMemory: 5,
      maxFamilyMembers: 0,
      maxCareRecords: 100,
      scanHistoryDays: 0,
      allowsSmartTagAddOns: true,
      allowsFoundReports: true,
      allowsAdvancedThemes: false,
      ownerCount: freeOwnerCount,
    },
    {
      id: "plan_premium",
      code: "Premium",
      name: premiumPlan.name,
      status: "ComingSoon",
      isArchived: false,
      priceLabel: premiumPlan.status,
      billingNote: "Not available yet",
      description: premiumPlan.description,
      maxPets: 10,
      maxMemoriesPerPet: 100,
      maxMediaPerMemory: 20,
      maxFamilyMembers: 5,
      maxCareRecords: 500,
      scanHistoryDays: 365,
      allowsSmartTagAddOns: true,
      allowsFoundReports: true,
      allowsAdvancedThemes: true,
      ownerCount: 0,
    },
  ];
}

async function loadLocalRows(): Promise<AdminOwnerPlan[]> {
  const [{ mockUsers }, summaries, data] = await Promise.all([
    import("@/data/mockUsers"),
    getOwnerSummaries(),
    getAdminData(),
  ]);

  return Promise.all(
    summaries.map(async (summary): Promise<AdminOwnerPlan> => {
      const user = mockUsers.find((item) => item.id === summary.user.id) ?? summary.user;
      const pets = getPetsForOwner(user, data.pets, mockUsers);
      const activePets = pets.filter((pet) => pet.lifecycleStatus === "Active");
      const memoriesPerPet = await Promise.all(
        pets.map(async (pet) => (await getPetMoments(pet.id)).data.length)
      );
      const highestMemories = memoriesPerPet.length > 0 ? Math.max(...memoriesPerPet) : 0;
      const totalMemories = memoriesPerPet.reduce((sum, count) => sum + count, 0);
      const assignedAt = toIso(user.joinedAt);

      return {
        ownerUserId: user.id,
        displayName: user.name,
        email: user.email,
        planCode: "Free",
        planName: `${freePlanLimits.planName} Plan`,
        planStatus: "Available",
        petCount: pets.length,
        activePetCount: activePets.length,
        maxPets: freePlanLimits.maxPets,
        petUsageState: deriveUsageState(activePets.length, freePlanLimits.maxPets),
        totalMemoryCount: totalMemories,
        highestMemoriesOnPet: highestMemories,
        maxMemoriesPerPet: freePlanLimits.maxMemoriesPerPet,
        memoryUsageState: deriveUsageState(highestMemories, freePlanLimits.maxMemoriesPerPet),
        careRecordCount: 0,
        maxCareRecords: 100,
        hasOverride: false,
        grandfathered: false,
        assignedAt,
        updatedAt: assignedAt,
      };
    })
  );
}

function filterLocal(rows: AdminOwnerPlan[], params: AdminOwnerPlanListParams) {
  const search = params.search?.trim().toLowerCase();

  return rows.filter((row) => {
    if (
      search &&
      !`${row.displayName} ${row.email} ${row.planCode} ${row.planName}`.toLowerCase().includes(search)
    ) {
      return false;
    }

    if (params.plan && row.planCode !== params.plan) return false;
    if (params.petUsage && row.petUsageState.toLowerCase() !== params.petUsage.toLowerCase()) return false;
    if (params.memoryUsage && row.memoryUsageState.toLowerCase() !== params.memoryUsage.toLowerCase()) return false;

    if (params.hasOverride) {
      const flagged = row.hasOverride || row.grandfathered;
      if (flagged !== (params.hasOverride === "true")) return false;
    }

    return (
      inRange(row.assignedAt, params.assignedFrom, params.assignedTo) &&
      inRange(row.updatedAt, params.updatedFrom, params.updatedTo)
    );
  });
}

function sortLocal(rows: AdminOwnerPlan[], params: AdminOwnerPlanListParams) {
  const field = params.sortBy ?? "updatedAt";
  const direction = params.sortDir === "asc" ? 1 : -1;

  const value = (row: AdminOwnerPlan): string | number => {
    switch (field) {
      case "owner":
        return row.displayName;
      case "email":
        return row.email;
      case "plan":
        return row.planCode;
      case "petUsage":
        return row.activePetCount;
      case "memoryUsage":
        return row.highestMemoriesOnPet;
      case "careRecords":
        return row.careRecordCount;
      case "assignedAt":
        return Date.parse(row.assignedAt) || 0;
      default:
        return Date.parse(row.updatedAt) || 0;
    }
  };

  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    const compare = typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b));
    return compare * direction || left.ownerUserId.localeCompare(right.ownerUserId);
  });
}

function inRange(value: string, from?: string, to?: string) {
  const time = Date.parse(value);
  return (
    (!from || time >= Date.parse(from)) &&
    (!to || time <= Date.parse(to.length === 10 ? `${to}T23:59:59Z` : to))
  );
}

function spreadsheetSafe(value: string) {
  const trimmed = value.trimStart();
  return trimmed && "=+-@\t\r".includes(trimmed[0]) ? `'${value}` : value;
}

function csvCell(value: string) {
  return `"${spreadsheetSafe(value).replaceAll('"', '""')}"`;
}

function toIso(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
