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
import { mockDelay, mockResponse } from "@/services/mockApi";
import { getPets } from "@/services/petService";
import {
  getStoredOrdersForAdmin,
  getStoredTagsForAdmin,
} from "@/services/tagService";
import type {
  AdminDashboard,
  MockUser,
  Pet,
  PetTag,
  TagOrder,
} from "@/types";

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

export async function getAdminQrProfiles() {
  await mockDelay();
  return mockResponse(
    mockPets.map((pet) => ({
      id: pet.id,
      petName: pet.name,
      slug: pet.slug,
      status: pet.qrStatus,
      url: pet.qrSafetyPath,
      owner: pet.owner.name,
    })),
    {
      page: 1,
      pageSize: mockPets.length,
      total: mockPets.length,
    }
  );
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
  const [pets, tags, orders] = await Promise.all([
    getPets(),
    getStoredTagsForAdmin(),
    getStoredOrdersForAdmin(),
  ]);

  return { pets: pets.data, tags: tags.data, orders: orders.data };
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
