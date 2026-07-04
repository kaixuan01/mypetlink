import { mockPlans } from "@/data/mockPlans";
import { mockPets } from "@/data/mockPets";
import { mockUsers } from "@/data/mockUsers";
import { readOwnerSettings } from "@/lib/ownerSettings";
import {
  getPetLifecycleStatus,
  isActivePet,
} from "@/lib/petLifecycle";
import {
  isActivePhysicalTagForPet,
  isPendingPhysicalTag,
  getTagOrder,
} from "@/lib/tagStatus";
import { apiRequest } from "@/services/apiClient";
import { canUseApi, getApiBaseUrl } from "@/services/apiConfig";
import { readStoredAuthSession } from "@/services/authStorage";
import { mockDelay, mockResponse } from "@/services/mockApi";
import { getPets, mapBackendPetToFrontend } from "@/services/petService";
import {
  archiveTag,
  disableTag,
  getStoredOrdersForAdmin,
  getStoredTagsForAdmin,
  mapBackendOrder,
  mapBackendTag,
  orderReplacementTag,
  reportTagLost,
  restoreTag,
} from "@/services/tagService";
import type {
  BackendPetListItem,
  BackendSmartTag,
  BackendTagOrder,
} from "@/services/apiDtos";
import type {
  AdminDashboard,
  MockUser,
  Pet,
  PetTag,
  TagOrder,
} from "@/types";

// Backend admin DTO shapes (subset of apps/api AdminDtos).
type BackendAdminOwnerRef = {
  userId: string;
  email: string;
  displayName: string;
};

type BackendAdminPetListItem = {
  pet: BackendPetListItem;
  owner: BackendAdminOwnerRef;
  breed?: string | null;
  qrSafetyEnabled: boolean;
  tagCount: number;
};

type BackendAdminSmartTag = {
  tag: BackendSmartTag;
  owner?: BackendAdminOwnerRef | null;
  petLifecycleStatus?: string | null;
};

type BackendAdminTagOrder = {
  order: BackendTagOrder;
  owner: BackendAdminOwnerRef;
};

type BackendAdminOwnerListItem = {
  userId: string;
  email: string;
  displayName: string;
  ownerDisplayName: string;
  planCode: string;
  status: string;
  phoneE164?: string | null;
  whatsappE164?: string | null;
  petCount: number;
  activePetCount: number;
  orderCount: number;
  createdAt: string;
  lastLoginAt?: string | null;
};

type BackendAdminDashboard = {
  summary: {
    totalOwners: number;
    totalPets: number;
    activePets: number;
    memorialPets: number;
    lostModePets: number;
    pendingPaymentProofs: number;
    ordersPendingPayment: number;
    ordersPreparing: number;
    ordersShipped: number;
    activeTags: number;
    lostOrDisabledTags: number;
    unclaimedTags: number;
  };
  recentOrders: BackendAdminTagOrder[];
  recentPaymentProofs: {
    proof: { id: string; uploadedAt: string };
    orderNumber: string;
    orderStatus: string;
    petName?: string | null;
    owner: BackendAdminOwnerRef;
  }[];
  recentActivity: {
    id: string;
    action: string;
    entity: string;
    entityId?: string | null;
    createdAt: string;
  }[];
};

export function canUseAdminApi() {
  return canUseApi() && Boolean(readStoredAuthSession()?.accessToken);
}

function mapAdminPet(item: BackendAdminPetListItem): Pet {
  const pet = mapBackendPetToFrontend(item.pet);

  return {
    ...pet,
    breed: item.breed || pet.breed,
    qrSafetyEnabled: item.qrSafetyEnabled,
    qrStatus: item.qrSafetyEnabled ? "active" : "paused",
    owner: {
      ...pet.owner,
      name: item.owner.displayName || item.owner.email,
    },
  };
}

function formatBackendDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export async function getAdminDashboard() {
  await mockDelay();
  const dashboard: AdminDashboard = {
    totalUsers: mockUsers.filter((user) => user.role === "owner").length,
    totalPets: mockPets.length,
    activeQrProfiles: mockPets.filter(
      (pet) => isActivePet(pet) && pet.qrStatus === "active"
    ).length,
    newProfilesThisMonth: 6,
  };

  return mockResponse(dashboard);
}

export async function getAdminPets() {
  await mockDelay();
  return mockResponse(mockPets, {
    page: 1,
    pageSize: mockPets.length,
    total: mockPets.length,
  });
}

export async function getAdminUsers() {
  await mockDelay();
  return mockResponse(mockUsers, {
    page: 1,
    pageSize: mockUsers.length,
    total: mockUsers.length,
  });
}

export async function getAdminPlans() {
  await mockDelay();
  return mockResponse(mockPlans, {
    page: 1,
    pageSize: mockPlans.length,
    total: mockPlans.length,
  });
}

// --- Shared-state admin views ------------------------------------------------
// Everything below reads through petService/tagService, i.e. the same stored
// collections the owner portal uses, so admin and owner views never diverge.

export type AdminData = {
  pets: Pet[];
  tags: PetTag[];
  orders: TagOrder[];
};

export async function getAdminData(): Promise<AdminData> {
  if (canUseAdminApi()) {
    const [pets, tags, orders] = await Promise.all([
      apiRequest<BackendAdminPetListItem[]>("/api/v1/admin/pets?page=1&pageSize=100"),
      apiRequest<BackendAdminSmartTag[]>("/api/v1/admin/tags?page=1&pageSize=100"),
      apiRequest<BackendAdminTagOrder[]>("/api/v1/admin/orders?page=1&pageSize=100"),
    ]);

    return {
      pets: (pets.data ?? []).map(mapAdminPet),
      tags: (tags.data ?? []).map((item) => mapBackendTag(item.tag)),
      orders: (orders.data ?? []).map((item) => mapBackendOrder(item.order)),
    };
  }

  const [pets, tags, orders] = await Promise.all([
    getPets(),
    getStoredTagsForAdmin(),
    getStoredOrdersForAdmin(),
  ]);

  return { pets: pets.data, tags: tags.data, orders: orders.data };
}

// Admin tag status actions. In API mode these call the admin endpoints (owner
// endpoints would reject tags the admin does not own); in demo mode they fall
// back to the shared localStorage helpers.
export type AdminTagAction =
  | "disable"
  | "mark-lost"
  | "mark-replaced"
  | "archive"
  | "restore";

export async function runAdminTagAction(tagId: string, action: AdminTagAction) {
  if (canUseAdminApi()) {
    const backendAction = action === "mark-replaced" ? "replace" : action;
    const response = await apiRequest<BackendAdminSmartTag>(
      `/api/v1/admin/tags/${encodeURIComponent(tagId)}/${backendAction}`,
      { method: "POST", body: {} }
    );

    return response.data ? mapBackendTag(response.data.tag) : null;
  }

  const handlers = {
    disable: disableTag,
    "mark-lost": reportTagLost,
    "mark-replaced": orderReplacementTag,
    archive: archiveTag,
    restore: restoreTag,
  } as const;

  const response = await handlers[action](tagId);
  return response.data;
}

// CSV export. API mode downloads the server CSV (authoritative inventory);
// demo mode returns null so callers keep the client-side CSV fallback.
export async function downloadAdminInventoryCsv(): Promise<boolean> {
  if (!canUseAdminApi()) {
    return false;
  }

  const session = readStoredAuthSession();
  const response = await fetch(`${getApiBaseUrl()}/api/v1/admin/tag-inventory/export`, {
    headers: session?.accessToken
      ? { Authorization: `Bearer ${session.accessToken}` }
      : undefined,
  });

  if (!response.ok) {
    throw new Error("Could not export the tag inventory right now.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "mypetlink-tag-inventory.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

export type AdminOwnerSummary = {
  user: MockUser;
  petCount: number;
  orderCount: number;
  phone: string;
  whatsapp: string;
};

// The demo has no owner id on pets, so pets and orders are attributed to an
// owner account by the owner display name carried on each pet. Pets whose
// display name matches no owner account (the portal lets the owner rename
// their contact display) are attributed to the signed-in demo owner account.
export function getPetsForOwner(user: MockUser, pets: Pet[]) {
  const ownerNames = new Set(
    mockUsers.filter((item) => item.role === "owner").map((item) => item.name)
  );
  const settings = readOwnerSettings();
  const isPortalOwner =
    user.email === settings.email || user.name === settings.ownerDisplayName;

  return pets.filter(
    (pet) =>
      pet.owner.name === user.name ||
      (isPortalOwner && !ownerNames.has(pet.owner.name))
  );
}

// Owner accounts for the admin Users page. API mode uses real FK-backed
// counts from /admin/owners; demo mode keeps the display-name attribution.
export async function getOwnerSummaries(): Promise<AdminOwnerSummary[]> {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendAdminOwnerListItem[]>(
      "/api/v1/admin/owners?page=1&pageSize=100"
    );

    return (response.data ?? []).map((owner) => ({
      user: {
        id: owner.userId,
        name: owner.ownerDisplayName || owner.displayName || owner.email,
        email: owner.email,
        role: "owner" as const,
        joinedAt: formatBackendDate(owner.createdAt),
        petCount: owner.petCount,
        status: owner.status.toLowerCase() as MockUser["status"],
      },
      petCount: owner.petCount,
      orderCount: owner.orderCount,
      phone: owner.phoneE164 ?? "",
      whatsapp: owner.whatsappE164 ?? "",
    }));
  }

  return buildOwnerSummaries(await getAdminData());
}

export function buildOwnerSummaries(data: AdminData): AdminOwnerSummary[] {
  return mockUsers
    .filter((user) => user.role === "owner")
    .map((user) => {
      const ownedPets = getPetsForOwner(user, data.pets);
      const ownedPetIds = new Set(ownedPets.map((pet) => pet.id));
      const orders = data.orders.filter((order) => ownedPetIds.has(order.petId));

      return {
        user,
        petCount: ownedPets.length,
        orderCount: orders.length,
        phone: ownedPets[0]?.owner.phone ?? "",
        whatsapp: ownedPets[0]?.owner.whatsapp ?? "",
      };
    });
}

export type AdminDashboardSummary = {
  totalOwners: number;
  totalPets: number;
  pendingPaymentProofs: number;
  ordersPreparing: number;
  activeTags: number;
  lostOrDisabledTags: number;
  unclaimedRetailTags: number;
  lostModePets: number;
};

export function buildDashboardSummary(data: AdminData): AdminDashboardSummary {
  const petMap = new Map(data.pets.map((pet) => [pet.id, pet]));
  const linkedPet = (tag: PetTag) =>
    tag.petId ? petMap.get(tag.petId) : undefined;

  return {
    totalOwners: mockUsers.filter((user) => user.role === "owner").length,
    totalPets: data.pets.length,
    pendingPaymentProofs: data.orders.filter(
      (order) => order.status === "Payment Submitted"
    ).length,
    ordersPreparing: data.orders.filter(
      (order) => order.status === "Preparing" || order.status === "Payment Confirmed"
    ).length,
    activeTags: data.tags.filter((tag) =>
      isActivePhysicalTagForPet(tag, linkedPet(tag))
    ).length,
    lostOrDisabledTags: data.tags.filter(
      (tag) => tag.status === "Lost" || tag.status === "Disabled"
    ).length,
    unclaimedRetailTags: data.tags.filter(
      (tag) => tag.status === "Unassigned" && !tag.petId && !tag.isArchived
    ).length,
    lostModePets: data.pets.filter(
      (pet) => isActivePet(pet) && pet.lostModeEnabled
    ).length,
  };
}

export type AdminActivityItem = {
  id: string;
  date: string;
  title: string;
  detail: string;
  href: string;
};

function parseDisplayDate(value?: string) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export type AdminDashboardData = {
  summary: AdminDashboardSummary;
  activity: {
    latestOrders: AdminActivityItem[];
    latestPaymentProofs: AdminActivityItem[];
    recentTags: AdminActivityItem[];
  };
};

// Dashboard data. API mode reads the server-computed /admin/dashboard summary
// and recent activity (including audit log entries); demo mode derives both
// from the shared local collections.
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  if (canUseAdminApi()) {
    const response = await apiRequest<BackendAdminDashboard>("/api/v1/admin/dashboard");
    const dashboard = response.data;

    if (!dashboard) {
      throw new Error("Dashboard data was not returned.");
    }

    return {
      summary: {
        totalOwners: dashboard.summary.totalOwners,
        totalPets: dashboard.summary.totalPets,
        pendingPaymentProofs: dashboard.summary.pendingPaymentProofs,
        ordersPreparing: dashboard.summary.ordersPreparing,
        activeTags: dashboard.summary.activeTags,
        lostOrDisabledTags: dashboard.summary.lostOrDisabledTags,
        unclaimedRetailTags: dashboard.summary.unclaimedTags,
        lostModePets: dashboard.summary.lostModePets,
      },
      activity: {
        latestOrders: dashboard.recentOrders.map((item) => ({
          id: `order-${item.order.id}`,
          date: formatBackendDate(item.order.createdAt),
          title: item.order.orderNumber,
          detail: `${item.order.petName ?? "Pet profile"} - ${item.owner.displayName || item.owner.email} - ${item.order.status}`,
          href: `/admin/orders?order=${encodeURIComponent(item.order.orderNumber)}`,
        })),
        latestPaymentProofs: dashboard.recentPaymentProofs.map((item) => ({
          id: `proof-${item.proof.id}`,
          date: formatBackendDate(item.proof.uploadedAt),
          title: item.orderNumber,
          detail: `${item.petName ?? "Pet profile"} - ${item.owner.displayName || item.owner.email} - ${item.orderStatus}`,
          href: "/admin/payment-proofs",
        })),
        recentTags: dashboard.recentActivity.map((item) => ({
          id: `activity-${item.id}`,
          date: formatBackendDate(item.createdAt),
          title: item.action,
          detail: item.entity,
          href: "/admin/tags",
        })),
      },
    };
  }

  const data = await getAdminData();

  return {
    summary: buildDashboardSummary(data),
    activity: buildRecentActivity(data),
  };
}

export function buildRecentActivity(data: AdminData): {
  latestOrders: AdminActivityItem[];
  latestPaymentProofs: AdminActivityItem[];
  recentTags: AdminActivityItem[];
} {
  const petMap = new Map(data.pets.map((pet) => [pet.id, pet]));
  const petName = (petId?: string) =>
    (petId && petMap.get(petId)?.name) || "Pet profile";

  const latestOrders = [...data.orders]
    .sort((a, b) => parseDisplayDate(b.orderedDate) - parseDisplayDate(a.orderedDate))
    .slice(0, 4)
    .map((order) => ({
      id: `order-${order.id}`,
      date: order.orderedDate,
      title: order.orderNumber ?? order.id,
      detail: `${petName(order.petId)} - ${order.tagType} - ${order.status}`,
      href: `/admin/orders?order=${encodeURIComponent(order.orderNumber ?? order.id)}`,
    }));

  const latestPaymentProofs = data.orders
    .filter((order) => order.paymentSubmittedDate)
    .sort(
      (a, b) =>
        parseDisplayDate(b.paymentSubmittedDate) -
        parseDisplayDate(a.paymentSubmittedDate)
    )
    .slice(0, 4)
    .map((order) => ({
      id: `proof-${order.id}`,
      date: order.paymentSubmittedDate ?? "",
      title: order.orderNumber ?? order.id,
      detail: `${petName(order.petId)} - ${order.estimatedPrice} - ${
        order.status === "Payment Submitted" ? "Awaiting review" : order.status
      }`,
      href: "/admin/payment-proofs",
    }));

  const recentTags = [...data.tags]
    .sort(
      (a, b) =>
        parseDisplayDate(b.activatedAt ?? b.deliveredDate ?? b.orderedDate) -
        parseDisplayDate(a.activatedAt ?? a.deliveredDate ?? a.orderedDate)
    )
    .slice(0, 4)
    .map((tag) => ({
      id: `tag-${tag.id}`,
      date: tag.activatedAt ?? tag.deliveredDate ?? tag.orderedDate ?? "",
      title: tag.tagCode,
      detail: `${tag.petId ? petName(tag.petId) : "Unclaimed retail stock"} - ${
        tag.isArchived ? "Archived" : tag.status
      }`,
      href: "/admin/tags",
    }));

  return { latestOrders, latestPaymentProofs, recentTags };
}

// Convenience wrappers matching how orders/tags relate to a pet.
export function getTagsForPet(petId: string, tags: PetTag[]) {
  return tags.filter((tag) => tag.petId === petId);
}

export function getOrdersForPet(petId: string, orders: TagOrder[]) {
  return orders.filter((order) => order.petId === petId);
}

export function getPetSummaryStatus(pet: Pet) {
  return getPetLifecycleStatus(pet);
}

export function getPendingTagCount(data: AdminData) {
  const petMap = new Map(data.pets.map((pet) => [pet.id, pet]));

  return data.tags.filter((tag) =>
    isPendingPhysicalTag(tag, getTagOrder(tag, data.orders)) &&
    (!tag.petId || petMap.has(tag.petId))
  ).length;
}
