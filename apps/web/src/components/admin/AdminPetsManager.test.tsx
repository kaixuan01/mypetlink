// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPetProfile, AdminPetProfileCounts } from "@/services/adminPetProfileService";
import { AdminPetsManager } from "./AdminPetsManager";

const mocks = vi.hoisted(() => ({
  listPets: vi.fn(),
  countPets: vi.fn(),
  downloadExport: vi.fn(),
  setFilter: vi.fn(),
  setPage: vi.fn(),
  setPageSize: vi.fn(),
  setSearch: vi.fn(),
  setSort: vi.fn(),
  setFilters: vi.fn(),
  clearAllFilters: vi.fn(),
  setExtraParam: vi.fn(),
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/table/useAdminTableQuery")>();
  return {
    ...actual,
    useAdminTableQuery: () => ({
      query: {
        page: 2,
        pageSize: 20,
        search: "topu",
        sortBy: "updatedAt",
        sortDir: "desc",
        filters: { view: "active", qrSafety: "accessible" },
      },
      hasActiveFilters: true,
      actions: {
        setFilter: mocks.setFilter,
        setFilters: mocks.setFilters,
        clearAllFilters: mocks.clearAllFilters,
        setPage: mocks.setPage,
        setPageSize: mocks.setPageSize,
        setSearch: mocks.setSearch,
        setSort: mocks.setSort,
        setExtraParam: mocks.setExtraParam,
        getExtraParam: () => "",
      },
    }),
  };
});

vi.mock("@/services/adminPetProfileService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminPetProfileService")>();
  return {
    ...actual,
    listAdminPetProfiles: mocks.listPets,
    countAdminPetProfiles: mocks.countPets,
    downloadAdminPetProfilesExport: mocks.downloadExport,
    getAdminPetProfileExportFormats: () => ["csv", "xlsx"],
  };
});

vi.mock("@/components/admin/AdminPetProfileDetailDrawer", () => ({
  AdminPetProfileDetailDrawer: () => <div>Pet detail drawer</div>,
}));

const basePet: AdminPetProfile = {
  id: "pet-1",
  name: "Topu",
  species: "Cat",
  breed: "Domestic Shorthair",
  gender: "Male",
  ageMode: "Exact birthday",
  ageDisplay: "4 years old",
  ownerId: "owner-1",
  ownerName: "Aina Owner",
  ownerEmail: "aina@example.com",
  lifecycle: "Active",
  lostModeEnabled: true,
  lostLastSeenDateTime: "2026-07-16T07:42:00Z",
  publicProfileEnabled: true,
  publicProfileAccessible: true,
  publicProfileSetupIssue: false,
  publicSlug: "topu-publiccode",
  publicCode: "publiccode",
  profileTheme: "mint",
  qrSafetyEnabled: true,
  qrSafetyAccessible: true,
  qrSafetySetupIssue: false,
  safetyCode: "safetycode",
  hasFinderContact: true,
  hasAllergies: true,
  showAllergiesPublicly: false,
  activeSmartTagCount: 1,
  totalSmartTagCount: 2,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-16T07:42:00Z",
};

const counts: AdminPetProfileCounts = { all: 7, active: 4, lostMode: 1, memorial: 1, archived: 2 };

beforeEach(() => {
  mocks.listPets.mockResolvedValue({ items: [basePet], total: 7 });
  mocks.countPets.mockResolvedValue(counts);
  mocks.downloadExport.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminPetsManager", () => {
  it("uses server paging, sorting, filters, and backend shortcut counts", async () => {
    render(<AdminPetsManager />);

    await screen.findByText(/Domestic Shorthair/);
    expect(mocks.listPets).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 20,
        search: "topu",
        view: "active",
        qrSafety: "accessible",
        sortBy: "updatedAt",
        sortDir: "desc",
      }),
      expect.any(AbortSignal)
    );
    expect(mocks.countPets).toHaveBeenCalledWith(expect.any(Object), expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Active 4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lost Mode 1" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Memorial 1" }));
    expect(mocks.setFilter).toHaveBeenCalledWith("view", "memorial");
  });

  it("distinguishes same-name pets by owner and hides broken public actions", async () => {
    mocks.listPets.mockResolvedValue({
      items: [
        basePet,
        {
          ...basePet,
          id: "pet-2",
          ownerId: "owner-2",
          ownerName: "Bala Owner",
          ownerEmail: "bala@example.com",
          publicProfileAccessible: false,
          publicProfileSetupIssue: true,
          qrSafetyAccessible: false,
          qrSafetySetupIssue: true,
          safetyCode: undefined,
          activeSmartTagCount: 0,
          totalSmartTagCount: 0,
        },
      ],
      total: 2,
    });
    render(<AdminPetsManager />);

    const menus = await screen.findAllByRole("button", { name: /More actions for Topu/ });
    expect(menus).toHaveLength(2);
    expect(menus[0].getAttribute("aria-label")).toContain("Aina Owner");
    expect(menus[1].getAttribute("aria-label")).toContain("Bala Owner");

    fireEvent.click(menus[1]);
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText("Open Public Share Profile")).toBeNull();
    expect(within(menu).queryByText("Open QR Safety Page")).toBeNull();
    expect(within(menu).getByText("View owner")).toBeTruthy();
    expect(within(menu).getByText("View Smart Tags")).toBeTruthy();
  });

  it("uses centralized public and QR routes only when accessible", async () => {
    render(<AdminPetsManager />);
    const trigger = await screen.findByRole("button", { name: "More actions for Topu, owned by Aina Owner" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Open Public Share Profile" }).getAttribute("href")).toBe("/p/topu-publiccode");
    expect(screen.getByRole("menuitem", { name: "Open QR Safety Page" }).getAttribute("href")).toBe("/q/safetycode");
    expect(screen.getByRole("menuitem", { name: "View owner" }).getAttribute("href")).toBe("/admin/users?owner=owner-1");
    expect(screen.getByRole("menuitem", { name: "View Smart Tags" }).getAttribute("href")).toBe("/admin/tags?pet=pet-1");
  });

  it("renders the shared retry state without falling back to local pets", async () => {
    mocks.listPets.mockRejectedValueOnce(new Error("offline"));
    render(<AdminPetsManager />);

    await screen.findByText("We couldn't load pet profiles. Please try again.");
    expect(screen.queryByText(/Domestic Shorthair/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(mocks.listPets).toHaveBeenCalledTimes(2));
  });
});
