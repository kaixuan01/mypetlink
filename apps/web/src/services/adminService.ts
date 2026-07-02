import { mockPlans } from "@/data/mockPlans";
import { mockPets } from "@/data/mockPets";
import { mockUsers } from "@/data/mockUsers";
import { isActivePet } from "@/lib/petLifecycle";
import { mockDelay, mockResponse } from "@/services/mockApi";
import type { AdminDashboard } from "@/types";

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
