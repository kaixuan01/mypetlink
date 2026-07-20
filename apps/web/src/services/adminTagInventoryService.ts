import { buildAdminListQuery, csvCell, triggerDownload } from "@/lib/adminListShared";
import { canUseAdminApi } from "@/services/adminService";
import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import { mockDelay } from "@/services/mockApi";
import { getPets } from "@/services/petService";
import {
  getStoredOrdersForAdmin,
  readAdminTagCollection,
  writeAdminTagCollection,
} from "@/services/tagService";
import type {
  Pet,
  PetTag,
  TagFulfilmentStatus,
  TagOrder,
  TagStatus,
  TagVariant,
} from "@/types";

// Tag Inventory data access. When the MyPetLink service is connected, every
// list/export/bulk call runs on the server with real filtering, sorting, and
// pagination. Without a connection the same operations run over the locally
// stored demo data so the page behaves identically.

export type AdminInventoryListParams = {
  page: number;
  pageSize: number;
  productVariantId?: string;
  search?: string;
  tagCode?: string;
  batch?: string;
  status?: string;
  fulfilment?: string;
  tagType?: string;
  variant?: string;
  claimed?: string;
  reseller?: string;
  generatedFrom?: string;
  generatedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: string;
  sortDir?: string;
};

export type AdminInventoryTag = {
  id: string;
  tagCode: string;
  productVariantId?: string;
  sku?: string;
  productName?: string;
  hasNfc: boolean;
  variant: TagVariant;
  batchNo?: string;
  resellerName?: string;
  status: TagStatus;
  isArchived: boolean;
  fulfilment: TagFulfilmentStatus;
  petId?: string;
  petName?: string;
  ownerName?: string;
  ownerEmail?: string;
  orderNumber?: string;
  generatedAt?: string;
  updatedAt?: string;
  printedAt?: string;
  sentToResellerAt?: string;
  receivedAt?: string;
  sentToOwnerAt?: string;
  activatedAt?: string;
  deliveredAt?: string;
  lastScannedAt?: string;
};

export type AdminInventoryListResult = {
  items: AdminInventoryTag[];
  total: number;
};

export type AdminInventoryBulkAction =
  | "mark-printed"
  | "send-to-reseller"
  | "mark-received"
  | "send-to-owner";

export type AdminInventoryBulkResult = {
  requestedCount: number;
  updatedCount: number;
  failures: { tagId: string; tagCode: string; reason: string }[];
};

export const fulfilmentLabels: Record<TagFulfilmentStatus, string> = {
  Generated: "Generated",
  Printed: "Printed",
  SentToReseller: "Sent to Reseller",
  Received: "Received",
  SentToOwner: "Sent to Owner",
};

// Lifecycle display: the stored demo value is "Unassigned"; operations copy
// calls that state Unclaimed everywhere.
export function lifecycleLabel(status: TagStatus, isArchived: boolean) {
  if (isArchived) {
    return "Archived";
  }

  return status === "Unassigned" ? "Unclaimed" : status;
}

// The fulfilment step each bulk action requires, and the step it moves to.
export const bulkActionRules: Record<
  AdminInventoryBulkAction,
  { from: TagFulfilmentStatus; to: TagFulfilmentStatus; label: string }
> = {
  "mark-printed": { from: "Generated", to: "Printed", label: "Mark Printed" },
  "send-to-reseller": {
    from: "Printed",
    to: "SentToReseller",
    label: "Send to Reseller",
  },
  "mark-received": {
    from: "SentToReseller",
    to: "Received",
    label: "Mark Received",
  },
  "send-to-owner": { from: "Printed", to: "SentToOwner", label: "Send to Owner" },
};

// Bulk fulfilment actions only apply to unclaimed, non-archived stock in the
// action's starting step; everything else would contradict the tag lifecycle.
export function canApplyBulkAction(
  tag: AdminInventoryTag,
  action: AdminInventoryBulkAction
) {
  return (
    !tag.isArchived &&
    tag.status === "Unassigned" &&
    tag.fulfilment === bulkActionRules[action].from
  );
}

type BackendInventoryItem = {
  id: string;
  tagCode: string;
  productVariantId?: string | null;
  sku?: string | null;
  productName?: string | null;
  hasNfc: boolean;
  variant: string;
  batchNo?: string | null;
  resellerName?: string | null;
  status: string;
  isArchived: boolean;
  fulfilmentStatus: TagFulfilmentStatus;
  petId?: string | null;
  petName?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  printedAt?: string | null;
  sentToResellerAt?: string | null;
  receivedAt?: string | null;
  sentToOwnerAt?: string | null;
  activatedAt?: string | null;
  deliveredAt?: string | null;
  lastScannedAt?: string | null;
};

function normalizeVariantLabel(value?: string | null): TagVariant {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return "Standard";
  }

  if (normalized.toLowerCase() === "lightweight") {
    return "Lightweight";
  }

  return normalized.toLowerCase() === "standard" ? "Standard" : normalized;
}

function mapBackendItem(item: BackendInventoryItem): AdminInventoryTag {
  return {
    id: item.id,
    tagCode: item.tagCode,
    productVariantId: item.productVariantId ?? undefined,
    sku: item.sku ?? undefined,
    productName: item.productName ?? undefined,
    hasNfc: item.hasNfc,
    // Variant labels are Admin-configurable presets, so unknown values are
    // preserved rather than collapsed; only the built-in pair is canonicalized.
    variant: normalizeVariantLabel(item.variant),
    batchNo: item.batchNo ?? undefined,
    resellerName: item.resellerName ?? undefined,
    status: item.status === "Unclaimed" ? "Unassigned" : (item.status as TagStatus),
    isArchived: item.isArchived,
    fulfilment: item.fulfilmentStatus,
    petId: item.petId ?? undefined,
    petName: item.petName ?? undefined,
    ownerName: item.ownerName ?? undefined,
    ownerEmail: item.ownerEmail ?? undefined,
    orderNumber: item.orderNumber ?? undefined,
    generatedAt: item.createdAt,
    updatedAt: item.updatedAt,
    printedAt: item.printedAt ?? undefined,
    sentToResellerAt: item.sentToResellerAt ?? undefined,
    receivedAt: item.receivedAt ?? undefined,
    sentToOwnerAt: item.sentToOwnerAt ?? undefined,
    activatedAt: item.activatedAt ?? undefined,
    deliveredAt: item.deliveredAt ?? undefined,
    lastScannedAt: item.lastScannedAt ?? undefined,
  };
}

function buildQueryString(params: AdminInventoryListParams) {
  return buildAdminListQuery(params, { dateOnlyToKeys: ["generatedTo", "updatedTo"] });
}

export async function listTagInventory(
  params: AdminInventoryListParams,
  signal?: AbortSignal
): Promise<AdminInventoryListResult> {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendInventoryItem[]>(
      `/api/v1/admin/tag-inventory?${buildQueryString(params)}`,
      { signal }
    );

    return {
      items: (response.data ?? []).map(mapBackendItem),
      total: response.meta?.total ?? response.data?.length ?? 0,
    };
  }

  await mockDelay();
  const all = await loadLocalInventory();
  const filtered = sortLocal(filterLocal(all, params), params);
  const start = (params.page - 1) * params.pageSize;

  return {
    items: filtered.slice(start, start + params.pageSize),
    total: filtered.length,
  };
}

export async function bulkUpdateTagInventory(
  action: AdminInventoryBulkAction,
  tagIds: string[]
): Promise<AdminInventoryBulkResult> {
  if (canUseAdminApi()) {
    const response = await apiRequest<AdminInventoryBulkResult>(
      "/api/v1/admin/tag-inventory/bulk-status",
      { method: "POST", body: { action, tagIds } }
    );

    return (
      response.data ?? { requestedCount: tagIds.length, updatedCount: 0, failures: [] }
    );
  }

  await mockDelay();
  const rule = bulkActionRules[action];
  const inventory = await loadLocalInventory();
  const inventoryById = new Map(inventory.map((tag) => [tag.id, tag]));
  const failures: AdminInventoryBulkResult["failures"] = [];
  const updates = new Map<string, TagFulfilmentStatus>();

  for (const tagId of tagIds) {
    const tag = inventoryById.get(tagId);

    if (!tag) {
      failures.push({ tagId, tagCode: "", reason: "This tag could not be found." });
      continue;
    }

    if (!canApplyBulkAction(tag, action)) {
      failures.push({
        tagId,
        tagCode: tag.tagCode,
        reason: tag.isArchived
          ? "Archived tags cannot be updated."
          : tag.status !== "Unassigned"
            ? `Only unclaimed stock can be updated. This tag is ${lifecycleLabel(tag.status, tag.isArchived)}.`
            : `This tag is ${fulfilmentLabels[tag.fulfilment]} and must be ${fulfilmentLabels[rule.from]} for this step.`,
      });
      continue;
    }

    updates.set(tagId, rule.to);
  }

  if (updates.size > 0) {
    writeAdminTagCollection(
      readAdminTagCollection().map((tag) =>
        updates.has(tag.id)
          ? { ...tag, fulfilmentStatus: updates.get(tag.id) }
          : tag
      )
    );
  }

  return {
    requestedCount: tagIds.length,
    updatedCount: updates.size,
    failures,
  };
}

// Which export formats the current mode supports. Excel exports are produced
// by the server; local data exports as CSV.
export function getSupportedExportFormats(): ("csv" | "xlsx")[] {
  return canUseAdminApi() ? ["csv", "xlsx"] : ["csv"];
}

// The manufacturer production workbook is generated and validated on the
// server (eligibility rules, canonical tag links), so it is only offered when
// the MyPetLink service is connected.
export function isManufacturerExportAvailable(): boolean {
  return canUseAdminApi();
}

// Downloads the production workbook for the physical tag manufacturer. The
// server validates every row (unclaimed, batch-tracked, not yet distributed)
// and blocks the export with per-tag reasons when anything is not safe to
// produce; nothing about the tags is changed by exporting.
export async function downloadTagManufacturerExport(
  params: AdminInventoryListParams,
  selectedIds?: string[]
): Promise<void> {
  const query = new URLSearchParams(buildQueryString(params));
  query.delete("page");
  query.delete("pageSize");

  if (selectedIds && selectedIds.length > 0) {
    query.set("ids", selectedIds.join(","));
  }

  const { blob, fileName } = await apiRequestBlob(
    `/api/v1/admin/tag-inventory/manufacturer-export?${query.toString()}`
  );

  triggerDownload(blob, fileName ?? "MyPetLink-Tag-Production.xlsx");
}

export async function downloadTagInventoryExport(
  params: AdminInventoryListParams,
  format: "csv" | "xlsx",
  selectedIds?: string[]
): Promise<void> {
  if (canUseAdminApi()) {
    const query = new URLSearchParams(buildQueryString(params));
    query.delete("page");
    query.delete("pageSize");
    query.set("format", format);

    if (selectedIds && selectedIds.length > 0) {
      query.set("ids", selectedIds.join(","));
    }

    const { blob, fileName } = await apiRequestBlob(
      `/api/v1/admin/tag-inventory/export?${query.toString()}`
    );

    triggerDownload(blob, fileName ?? `mypetlink-tag-inventory.${format}`);
    return;
  }

  await mockDelay();
  const all = await loadLocalInventory();
  let rows = sortLocal(filterLocal(all, params), params);

  if (selectedIds && selectedIds.length > 0) {
    const selection = new Set(selectedIds);
    rows = rows.filter((tag) => selection.has(tag.id));
  }

  const header = [
    "Tag Code",
    "Tag Type",
    "Variant",
    "Batch",
    "Lifecycle Status",
    "Fulfilment Status",
    "Linked Pet",
    "Linked Owner",
    "Generated",
  ];
  const lines = [
    header,
    ...rows.map((tag) => [
      tag.tagCode,
      tag.hasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag",
      `${tag.variant} Tag`,
      tag.batchNo ?? "",
      lifecycleLabel(tag.status, tag.isArchived),
      fulfilmentLabels[tag.fulfilment],
      tag.petName ?? "",
      tag.ownerName ?? "",
      tag.generatedAt ?? "",
    ]),
  ];
  const csv = lines
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  triggerDownload(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    "mypetlink-tag-inventory.csv"
  );
}


// --- Local-data implementation ----------------------------------------------

// Infers a fulfilment step for stored tags created before fulfilment tracking:
// tags that reached an owner via an order were sent to the owner, activated
// retail tags reached a customer through a reseller, everything else is
// untouched new stock.
function deriveLocalFulfilment(tag: PetTag, orders: TagOrder[]): TagFulfilmentStatus {
  if (tag.fulfilmentStatus) {
    return tag.fulfilmentStatus;
  }

  const leftOurHands =
    tag.status === "Delivered" ||
    tag.status === "Active" ||
    tag.status === "Lost" ||
    tag.status === "Replaced" ||
    Boolean(tag.deliveredDate || tag.activatedAt);

  if (!leftOurHands) {
    return "Generated";
  }

  const hasOrder = orders.some((order) => order.tagId === tag.id);
  return hasOrder ? "SentToOwner" : "Received";
}

async function loadLocalInventory(): Promise<AdminInventoryTag[]> {
  const [pets, orders] = await Promise.all([
    getPets(),
    getStoredOrdersForAdmin(),
  ]);
  const petMap = new Map<string, Pet>(pets.data.map((pet) => [pet.id, pet]));
  const orderByTag = new Map(
    orders.data
      .filter((order) => order.tagId)
      .map((order) => [order.tagId as string, order])
  );

  return readAdminTagCollection()
    .filter((tag) => tag.batchNo || tag.status === "Unassigned")
    .map((tag) => {
      const pet = tag.petId ? petMap.get(tag.petId) : undefined;
      const order = orderByTag.get(tag.id);

      return {
        id: tag.id,
        tagCode: tag.tagCode,
        hasNfc: tag.hasNfc,
        variant: tag.variant,
        batchNo: tag.batchNo,
        status: tag.status,
        isArchived: Boolean(tag.isArchived),
        fulfilment: deriveLocalFulfilment(tag, orders.data),
        petId: tag.petId,
        petName: pet?.name,
        ownerName: pet?.owner.name,
        orderNumber: order?.orderNumber,
        generatedAt: tag.orderedDate,
        updatedAt: tag.orderedDate,
        activatedAt: tag.activatedAt,
        deliveredAt: tag.deliveredDate,
        lastScannedAt: tag.lastScannedAt,
      };
    });
}

function parseLocalDate(value?: string) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function filterLocal(
  tags: AdminInventoryTag[],
  params: AdminInventoryListParams
): AdminInventoryTag[] {
  const search = params.search?.trim().toLowerCase();
  const tagCode = params.tagCode?.trim().toLowerCase();
  const status = params.status?.trim().toLowerCase();
  const generatedFrom = params.generatedFrom ? Date.parse(params.generatedFrom) : null;
  const generatedTo = params.generatedTo
    ? Date.parse(`${params.generatedTo}T23:59:59`)
    : null;

  return tags.filter((tag) => {
    if (params.productVariantId && tag.productVariantId !== params.productVariantId) {
      return false;
    }
    if (search) {
      const haystack = [
        tag.tagCode,
        tag.batchNo,
        tag.petName,
        tag.ownerName,
        tag.ownerEmail,
        tag.orderNumber,
        tag.resellerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(search)) {
        return false;
      }
    }

    if (tagCode && !tag.tagCode.toLowerCase().includes(tagCode)) {
      return false;
    }

    if (params.batch && tag.batchNo !== params.batch) {
      return false;
    }

    if (status) {
      if (status === "archived") {
        if (!tag.isArchived) {
          return false;
        }
      } else {
        const normalized = status === "unclaimed" ? "unassigned" : status;

        if (tag.isArchived || tag.status.toLowerCase() !== normalized) {
          return false;
        }
      }
    }

    if (params.fulfilment && tag.fulfilment !== params.fulfilment) {
      return false;
    }

    if (params.tagType) {
      const wantsNfc = params.tagType.toUpperCase().includes("NFC");

      if (tag.hasNfc !== wantsNfc) {
        return false;
      }
    }

    if (params.variant && tag.variant !== params.variant) {
      return false;
    }

    if (params.claimed === "true" && !tag.petId) {
      return false;
    }

    if (params.claimed === "false" && tag.petId) {
      return false;
    }

    if (
      params.reseller &&
      !(tag.resellerName ?? "").toLowerCase().includes(params.reseller.toLowerCase())
    ) {
      return false;
    }

    const generated = parseLocalDate(tag.generatedAt);

    if (generatedFrom !== null && generated < generatedFrom) {
      return false;
    }

    if (generatedTo !== null && generated > generatedTo) {
      return false;
    }

    return true;
  });
}

function sortLocal(
  tags: AdminInventoryTag[],
  params: AdminInventoryListParams
): AdminInventoryTag[] {
  const field = params.sortBy || "generatedAt";
  const direction = params.sortDir === "asc" ? 1 : -1;

  const value = (tag: AdminInventoryTag): string | number => {
    switch (field) {
      case "tagCode":
        return tag.tagCode;
      case "batch":
        return tag.batchNo ?? "";
      case "status":
        return lifecycleLabel(tag.status, tag.isArchived);
      case "fulfilment":
        return tag.fulfilment;
      case "variant":
        return tag.variant;
      case "updatedAt":
        return parseLocalDate(tag.updatedAt);
      default:
        return parseLocalDate(tag.generatedAt);
    }
  };

  return [...tags].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const compare =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));

    return compare !== 0 ? compare * direction : a.id.localeCompare(b.id);
  });
}
