import { buildAdminListQuery, csvCell, triggerDownload } from "@/lib/adminListShared";
import { normalizeTagScanSource } from "@/lib/tagScanSource";
import { canUseAdminApi } from "@/services/adminService";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import { mockDelay } from "@/services/mockApi";
import { getPets } from "@/services/petService";
import { getStoredOrdersForAdmin, readAdminTagCollection, writeAdminTagCollection } from "@/services/tagService";
import type { Pet, PetTag, TagOrder, TagScanSource, TagStatus, TagVariant } from "@/types";

export type AdminSmartTagListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  tagType?: string;
  variant?: string;
  claimed?: string;
  petId?: string;
  ownerId?: string;
  pet?: string;
  owner?: string;
  hasOrder?: string;
  hasScans?: string;
  activatedFrom?: string;
  activatedTo?: string;
  createdFrom?: string;
  createdTo?: string;
  lastScannedFrom?: string;
  lastScannedTo?: string;
  sortBy?: string;
  sortDir?: string;
};

export type AdminSmartTag = {
  id: string;
  tagCode: string;
  hasNfc: boolean;
  variant: TagVariant;
  status: TagStatus;
  isArchived: boolean;
  petId?: string;
  petName?: string;
  safetyCode?: string;
  qrSafetyEnabled: boolean;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  orderId?: string;
  orderNumber?: string;
  batchNumber?: string;
  activatedAt?: string;
  lastScannedAt?: string;
  latestScanSource?: TagScanSource;
  scanCount: number;
  qrScanCount?: number;
  nfcScanCount?: number;
  legacyOrUnknownScanCount?: number;
  createdAt: string;
  updatedAt: string;
  replacementForTagId?: string;
  replacementForTagCode?: string;
  replacedByTagCode?: string;
};

export type AdminSmartTagCounts = {
  all: number;
  active: number;
  awaitingActivation: number;
  unclaimed: number;
  lost: number;
  disabled: number;
  replaced: number;
  archived: number;
};

export type AdminSmartTagScan = {
  id: string;
  scanSource: TagScanSource;
  resolvedState: string;
  scannedAt: string;
  city?: string;
  country?: string;
  deviceType?: string;
};

export type AdminSmartTagAction = "disable" | "mark-lost" | "archive" | "restore" | "reactivate";
export type AdminSmartTagBulkAction = "disable" | "archive";
export type AdminSmartTagAssignmentAction = "claim" | "assign-pet" | "change-pet" | "unassign-pet" | "transfer";
export type AdminSmartTagAssignmentInput = {
  ownerId?: string;
  petId?: string;
  reason?: string;
};
export type AdminSmartTagBulkResult = {
  action: string;
  requestedCount: number;
  updatedCount: number;
  failures: { tagId: string; tagCode: string; reason: string }[];
};

export const smartTagLifecycleLabels: Record<TagStatus, string> = {
  Unassigned: "Unclaimed",
  Pending: "Pending activation",
  Preparing: "Preparing for owner",
  Delivered: "Delivered / awaiting activation",
  Active: "Active",
  Disabled: "Disabled",
  Lost: "Lost",
  Replaced: "Replaced",
  Archived: "Archived",
};

export function smartTagLifecycleLabel(tag: Pick<AdminSmartTag, "status" | "isArchived">) {
  return tag.isArchived ? "Archived" : smartTagLifecycleLabels[tag.status];
}

export function canRunSmartTagAction(tag: AdminSmartTag, action: AdminSmartTagAction) {
  if (action === "restore") return tag.isArchived || tag.status === "Archived";
  if (tag.isArchived || tag.status === "Archived" || tag.status === "Replaced") return false;
  if (action === "reactivate") return ["Disabled", "Lost"].includes(tag.status) && Boolean(tag.ownerId && tag.petId);
  if (action === "mark-lost") return tag.status === "Active" || tag.status === "Delivered";
  if (action === "disable") return ["Active", "Delivered", "Unassigned"].includes(tag.status);
  return action === "archive";
}

export function getSmartTagAssignmentActions(tag: AdminSmartTag): AdminSmartTagAssignmentAction[] {
  if (tag.isArchived || ["Archived", "Replaced", "Lost", "Disabled"].includes(tag.status)) return [];
  if (!tag.ownerId) return tag.status === "Unassigned" && !tag.petId ? ["claim"] : [];

  const actions: AdminSmartTagAssignmentAction[] = tag.petId
    ? ["change-pet", "unassign-pet", "transfer"]
    : ["assign-pet", "transfer"];
  return actions;
}

export function smartTagAssignmentLabel(tag: AdminSmartTag) {
  if (!tag.ownerId) return "Unclaimed";
  return tag.petId ? "Owner and pet assigned" : "Awaiting pet assignment";
}

type BackendItem = {
  id: string; tagCode: string; hasNfc: boolean; variant: string; status: string; isArchived: boolean;
  petId?: string | null; petName?: string | null; safetyCode?: string | null; qrSafetyEnabled: boolean;
  ownerUserId?: string | null; ownerName?: string | null; ownerEmail?: string | null;
  orderId?: string | null; orderNumber?: string | null; batchNumber?: string | null;
  activatedAt?: string | null; lastScannedAt?: string | null;
  latestScanSource?: TagScanSource | null; scanCount: number;
  qrScanCount: number; nfcScanCount: number; legacyOrUnknownScanCount: number;
  createdAt: string; updatedAt: string; replacementForTagId?: string | null;
  replacementForTagCode?: string | null; replacedByTagCode?: string | null;
};

function mapBackend(item: BackendItem): AdminSmartTag {
  return {
    id: item.id,
    tagCode: item.tagCode,
    hasNfc: item.hasNfc,
    variant: item.variant?.toLowerCase() === "lightweight" ? "Lightweight" : "Standard",
    status: item.status === "Unclaimed" ? "Unassigned" : (item.status as TagStatus),
    isArchived: item.isArchived,
    petId: item.petId ?? undefined,
    petName: item.petName ?? undefined,
    safetyCode: item.safetyCode ?? undefined,
    qrSafetyEnabled: item.qrSafetyEnabled,
    ownerId: item.ownerUserId ?? undefined,
    ownerName: item.ownerName ?? undefined,
    ownerEmail: item.ownerEmail ?? undefined,
    orderId: item.orderId ?? undefined,
    orderNumber: item.orderNumber ?? undefined,
    batchNumber: item.batchNumber ?? undefined,
    activatedAt: item.activatedAt ?? undefined,
    lastScannedAt: item.lastScannedAt ?? undefined,
    latestScanSource: item.latestScanSource ?? undefined,
    scanCount: item.scanCount,
    qrScanCount: item.qrScanCount,
    nfcScanCount: item.nfcScanCount,
    legacyOrUnknownScanCount: item.legacyOrUnknownScanCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    replacementForTagId: item.replacementForTagId ?? undefined,
    replacementForTagCode: item.replacementForTagCode ?? undefined,
    replacedByTagCode: item.replacedByTagCode ?? undefined,
  };
}

function buildQuery(params: AdminSmartTagListParams, omitPaging = false) {
  return buildAdminListQuery(params, { dateOnlyToKeys: ["activatedTo", "createdTo", "lastScannedTo"], omitPaging });
}

export async function listAdminSmartTags(params: AdminSmartTagListParams, signal?: AbortSignal) {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendItem[]>(`/api/v1/admin/tags?${buildQuery(params)}`, { signal });
    return { items: (response.data ?? []).map(mapBackend), total: response.meta?.total ?? 0 };
  }
  await mockDelay();
  const all = await loadLocalRows();
  const filtered = sortLocal(filterLocal(all, params), params);
  const start = (params.page - 1) * params.pageSize;
  return { items: filtered.slice(start, start + params.pageSize), total: filtered.length };
}

export async function countAdminSmartTags(params: AdminSmartTagListParams, signal?: AbortSignal): Promise<AdminSmartTagCounts> {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminSmartTagCounts>(`/api/v1/admin/tags/counts?${buildQuery(params)}`, { signal });
    return response.data ?? emptyCounts();
  }
  await mockDelay();
  const withoutStatus = { ...params, status: undefined };
  return countsFor(filterLocal(await loadLocalRows(), withoutStatus));
}

// Single-tag lookup for deep links (e.g. an order pointing at its assigned
// tag) whose target is not on the currently loaded page.
export async function getAdminSmartTag(tagId: string, signal?: AbortSignal): Promise<AdminSmartTag> {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendItem>(`/api/v1/admin/tags/${encodeURIComponent(tagId)}`, { signal });
    if (!response.data) throw new Error("This Smart Tag could not be found.");
    return mapBackend(response.data);
  }
  await mockDelay();
  const tag = (await loadLocalRows()).find((row) => row.id === tagId);
  if (!tag) throw new Error("This Smart Tag could not be found.");
  return tag;
}

export async function getAdminSmartTagScans(
  tagId: string,
  source?: TagScanSource,
  signal?: AbortSignal
): Promise<AdminSmartTagScan[]> {
  if (canUseAdminApi()) {
    const query = source ? `?source=${encodeURIComponent(source)}` : "";
    const response = await apiRequest<AdminSmartTagScan[]>(
      `/api/v1/admin/tags/${encodeURIComponent(tagId)}/scans${query}`,
      { signal }
    );
    return (response.data ?? []).map((scan) => ({
      ...scan,
      scanSource: normalizeTagScanSource(scan.scanSource),
      city: scan.city ?? undefined,
      country: scan.country ?? undefined,
      deviceType: scan.deviceType ?? undefined,
    }));
  }
  await mockDelay();
  const tag = (await loadLocalRows()).find((row) => row.id === tagId);
  if (!tag?.lastScannedAt || (source && source !== "Legacy")) return [];
  return [{ id: `${tag.id}-latest`, scanSource: "Legacy", resolvedState: "Active", scannedAt: tag.lastScannedAt }];
}

export async function downloadAdminSmartTagScansExport(
  tagId: string,
  format: "csv" | "xlsx",
  source?: TagScanSource
) {
  if (!canUseAdminApi()) {
    throw new Error("Scan-history export is available when connected to MyPetLink.");
  }
  const query = new URLSearchParams({ format });
  if (source) query.set("source", source);
  const { blob, fileName } = await apiRequestBlob(
    `/api/v1/admin/tags/${encodeURIComponent(tagId)}/scans/export?${query}`
  );
  triggerDownload(blob, fileName ?? `mypetlink-${tagId}-scan-history.${format}`);
}

export async function runAdminSmartTagAction(tagId: string, action: AdminSmartTagAction, reason?: string) {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendItem>(`/api/v1/admin/tags/${encodeURIComponent(tagId)}/${action}`, {
      method: "POST", body: { reason: reason || null },
    });
    if (!response.data) throw new Error("The tag response was empty.");
    return mapBackend(response.data);
  }
  await mockDelay();
  const rows = await loadLocalRows();
  const target = rows.find((row) => row.id === tagId);
  if (!target || !canRunSmartTagAction(target, action)) throw new Error("This action is not available for the tag's current status.");
  const nextStatus: TagStatus = action === "disable" ? "Disabled" : action === "mark-lost" ? "Lost" : action === "archive" ? "Archived" : action === "reactivate" ? (target.activatedAt ? "Active" : "Delivered") : "Disabled";
  writeAdminTagCollection(readAdminTagCollection().map((tag) => tag.id === tagId ? { ...tag, status: nextStatus, isArchived: action === "archive" ? true : action === "restore" ? false : tag.isArchived } : tag));
  return { ...target, status: nextStatus, isArchived: action === "archive" ? true : action === "restore" ? false : target.isArchived, updatedAt: new Date().toISOString() };
}

export async function updateAdminSmartTagAssignment(
  tag: AdminSmartTag,
  action: AdminSmartTagAssignmentAction,
  input: AdminSmartTagAssignmentInput
) {
  if (canUseAdminApi()) {
    const pathAction = action === "change-pet" || action === "assign-pet" ? "pet" : action;
    const body = action === "claim"
      ? { ownerUserId: input.ownerId, petId: input.petId, expectedUpdatedAt: tag.updatedAt, reason: input.reason || null }
      : action === "transfer"
        ? { newOwnerUserId: input.ownerId, newPetId: input.petId, expectedUpdatedAt: tag.updatedAt, reason: input.reason }
        : action === "unassign-pet"
          ? { expectedUpdatedAt: tag.updatedAt, reason: input.reason || null }
          : { petId: input.petId, expectedUpdatedAt: tag.updatedAt, reason: input.reason || null };
    const response = await apiRequest<BackendItem>(
      `/api/v1/admin/tags/${encodeURIComponent(tag.id)}/assignment/${pathAction}`,
      { method: "POST", body }
    );
    if (!response.data) throw new Error("The tag response was empty.");
    return mapBackend(response.data);
  }

  await mockDelay();
  if (!getSmartTagAssignmentActions(tag).includes(action)) {
    throw new Error("This assignment action is no longer available for the tag.");
  }
  const petsResponse = await getPets();
  const pet = input.petId ? (petsResponse.data ?? []).find((item) => item.id === input.petId) : undefined;
  const ownerId = action === "claim" || action === "transfer" ? input.ownerId : tag.ownerId;
  if (action !== "unassign-pet" && (!pet || !ownerId || pet.ownerUserId !== ownerId)) {
    throw new Error("The selected pet must belong to the selected owner.");
  }
  const nextStatus: TagStatus = action === "claim" || action === "transfer" ? "Pending" : tag.status;
  const petId = action === "unassign-pet" ? undefined : pet?.id;
  const updatedAt = new Date().toISOString();
  writeAdminTagCollection(readAdminTagCollection().map((row) => row.id === tag.id ? {
    ...row,
    ownerUserId: ownerId,
    petId,
    status: nextStatus,
    activatedAt: action === "transfer" ? undefined : row.activatedAt,
  } : row));
  return {
    ...tag,
    ownerId,
    ownerName: action === "unassign-pet" ? tag.ownerName : pet?.owner.name,
    petId,
    petName: pet?.name,
    safetyCode: pet?.safetyCode,
    qrSafetyEnabled: pet?.qrSafetyEnabled ?? false,
    status: nextStatus,
    activatedAt: action === "transfer" ? undefined : tag.activatedAt,
    updatedAt,
  };
}

export async function bulkUpdateAdminSmartTags(action: AdminSmartTagBulkAction, tagIds: string[], reason?: string): Promise<AdminSmartTagBulkResult> {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminSmartTagBulkResult>("/api/v1/admin/tags/bulk-status", {
      method: "POST", body: { action, tagIds, reason: reason || null },
    });
    return response.data ?? { action, requestedCount: tagIds.length, updatedCount: 0, failures: [] };
  }
  const failures: AdminSmartTagBulkResult["failures"] = [];
  let updatedCount = 0;
  for (const id of tagIds) {
    try { await runAdminSmartTagAction(id, action); updatedCount++; }
    catch (error) { failures.push({ tagId: id, tagCode: "", reason: error instanceof Error ? error.message : "This tag could not be updated." }); }
  }
  return { action, requestedCount: tagIds.length, updatedCount, failures };
}

export function getAdminSmartTagExportFormats(): ("csv" | "xlsx")[] { return canUseAdminApi() ? ["csv", "xlsx"] : ["csv"]; }

export async function downloadAdminSmartTagsExport(params: AdminSmartTagListParams, format: "csv" | "xlsx", selectedIds?: string[]) {
  if (canUseAdminApi()) {
    const query = new URLSearchParams(buildQuery(params, true));
    query.set("format", format);
    if (selectedIds?.length) query.set("ids", selectedIds.join(","));
    const { blob, fileName } = await apiRequestBlob(`/api/v1/admin/tags/export?${query}`);
    triggerDownload(blob, fileName ?? `mypetlink-smart-tags.${format}`);
    return;
  }
  await mockDelay();
  let rows = sortLocal(filterLocal(await loadLocalRows(), params), params);
  if (selectedIds?.length) { const selected = new Set(selectedIds); rows = rows.filter((row) => selected.has(row.id)); }
  const data = [["Tag Code", "Tag Type", "Variant", "Lifecycle Status", "Pet", "Owner", "Order", "Activated", "Last Scanned", "Scan Count", "Created", "Updated"],
    ...rows.map((row) => [row.tagCode, row.hasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag", row.variant, smartTagLifecycleLabel(row), row.petName ?? "", row.ownerName ?? "", row.orderNumber ?? "", row.activatedAt ?? "", row.lastScannedAt ?? "", String(row.scanCount), row.createdAt, row.updatedAt])];
  const csv = data.map((row) => row.map(csvCell).join(",")).join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mypetlink-smart-tags.csv");
}


async function loadLocalRows(): Promise<AdminSmartTag[]> {
  const [petsResponse, ordersResponse] = await Promise.all([getPets(), getStoredOrdersForAdmin()]);
  const pets = petsResponse.data ?? [];
  const orders = ordersResponse.data ?? [];
  const petMap = new Map(pets.map((pet) => [pet.id, pet]));
  const orderMap = new Map(orders.map((order) => [order.tagId, order]));
  return readAdminTagCollection().map((tag) => localRow(tag, petMap.get(tag.petId ?? ""), orderMap.get(tag.id)));
}

function localRow(tag: PetTag, pet?: Pet, order?: TagOrder): AdminSmartTag {
  const createdAt = tag.orderedDate ?? tag.activatedAt ?? new Date(0).toISOString();
  return { id: tag.id, tagCode: tag.tagCode, hasNfc: tag.hasNfc, variant: tag.variant === "Lightweight" ? "Lightweight" : "Standard", status: tag.status,
    isArchived: Boolean(tag.isArchived), petId: tag.petId, petName: pet?.name, safetyCode: pet?.safetyCode,
    qrSafetyEnabled: pet?.qrSafetyEnabled ?? false, ownerId: tag.ownerUserId ?? pet?.ownerUserId, ownerName: pet?.owner.name,
    orderId: order?.id, orderNumber: order?.orderNumber, batchNumber: tag.batchNo,
    activatedAt: tag.activatedAt, lastScannedAt: tag.lastScannedAt,
    latestScanSource: tag.lastScannedAt ? "Legacy" : undefined,
    scanCount: tag.lastScannedAt ? 1 : 0, qrScanCount: 0, nfcScanCount: 0,
    legacyOrUnknownScanCount: tag.lastScannedAt ? 1 : 0,
    createdAt, updatedAt: tag.lastScannedAt ?? tag.activatedAt ?? createdAt, replacementForTagId: tag.replacementForTagId };
}

function filterLocal(rows: AdminSmartTag[], params: AdminSmartTagListParams) {
  const search = params.search?.trim().toLowerCase();
  const lifecycleStatus = params.status === "Unclaimed" ? "Unassigned" : params.status;
  return rows.filter((row) => {
    if (search && ![row.tagCode, row.petName, row.ownerName, row.ownerEmail, row.orderNumber, row.batchNumber].some((value) => value?.toLowerCase().includes(search))) return false;
    if (params.status === "awaiting-activation" && !["Pending", "Preparing", "Delivered"].includes(row.status)) return false;
    if (params.status === "archived" && !row.isArchived) return false;
    if (lifecycleStatus && !["awaiting-activation", "archived"].includes(lifecycleStatus) && row.status.toLowerCase() !== lifecycleStatus.toLowerCase()) return false;
    if (params.tagType && (params.tagType === "QR_NFC") !== row.hasNfc) return false;
    if (params.variant && row.variant !== params.variant) return false;
    if (params.claimed && (params.claimed === "true") !== Boolean(row.ownerId)) return false;
    if (params.petId && row.petId !== params.petId) return false;
    if (params.ownerId && row.ownerId !== params.ownerId) return false;
    if (params.pet && !row.petName?.toLowerCase().includes(params.pet.toLowerCase())) return false;
    if (params.owner && ![row.ownerName, row.ownerEmail].some((value) => value?.toLowerCase().includes(params.owner!.toLowerCase()))) return false;
    if (params.hasOrder && (params.hasOrder === "true") !== Boolean(row.orderId)) return false;
    if (params.hasScans && (params.hasScans === "true") !== (row.scanCount > 0)) return false;
    return inRange(row.activatedAt, params.activatedFrom, params.activatedTo) && inRange(row.createdAt, params.createdFrom, params.createdTo) && inRange(row.lastScannedAt, params.lastScannedFrom, params.lastScannedTo);
  });
}

function inRange(value?: string, from?: string, to?: string) {
  if (!from && !to) return true; if (!value) return false;
  const time = Date.parse(value); if (Number.isNaN(time)) return false;
  return (!from || time >= Date.parse(from)) && (!to || time <= Date.parse(to.length === 10 ? `${to}T23:59:59Z` : to));
}

function sortLocal(rows: AdminSmartTag[], params: AdminSmartTagListParams) {
  const key = params.sortBy ?? "updatedAt"; const direction = params.sortDir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => String((left as unknown as Record<string, unknown>)[key] ?? "").localeCompare(String((right as unknown as Record<string, unknown>)[key] ?? "")) * direction || left.id.localeCompare(right.id));
}

function countsFor(rows: AdminSmartTag[]): AdminSmartTagCounts {
  return { all: rows.length, active: rows.filter((row) => !row.isArchived && row.status === "Active").length,
    awaitingActivation: rows.filter((row) => !row.isArchived && ["Pending", "Preparing", "Delivered"].includes(row.status)).length,
    unclaimed: rows.filter((row) => !row.isArchived && row.status === "Unassigned").length,
    lost: rows.filter((row) => !row.isArchived && row.status === "Lost").length,
    disabled: rows.filter((row) => !row.isArchived && row.status === "Disabled").length,
    replaced: rows.filter((row) => !row.isArchived && row.status === "Replaced").length,
    archived: rows.filter((row) => row.isArchived || row.status === "Archived").length };
}

function emptyCounts(): AdminSmartTagCounts { return { all: 0, active: 0, awaitingActivation: 0, unclaimed: 0, lost: 0, disabled: 0, replaced: 0, archived: 0 }; }
