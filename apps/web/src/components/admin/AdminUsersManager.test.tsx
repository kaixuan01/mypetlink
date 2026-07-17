// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOwner, AdminOwnerCounts } from "@/services/adminOwnerService";
import { AdminUsersManager } from "./AdminUsersManager";

const mocks = vi.hoisted(() => ({
  listOwners: vi.fn(),
  countOwners: vi.fn(),
  downloadExport: vi.fn(),
  setFilter: vi.fn(),
  setFilters: vi.fn(),
  clearAllFilters: vi.fn(),
  setPage: vi.fn(),
  setPageSize: vi.fn(),
  setSearch: vi.fn(),
  setSort: vi.fn(),
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
        search: "aina",
        sortBy: "joinedAt",
        sortDir: "desc",
        filters: { status: "Active", contactReady: "true", hasPets: "true", memoryUsageNearLimit: "true" },
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

vi.mock("@/services/adminOwnerService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminOwnerService")>();
  return {
    ...actual,
    listAdminOwners: mocks.listOwners,
    countAdminOwners: mocks.countOwners,
    downloadAdminOwnersExport: mocks.downloadExport,
    getAdminOwnerExportFormats: () => ["csv", "xlsx"],
  };
});

vi.mock("@/components/admin/AdminOwnerDetailDrawer", () => ({
  AdminOwnerDetailDrawer: () => <div>Owner detail drawer</div>,
}));

const owner: AdminOwner = {
  ownerUserId: "92222222-2222-4222-8222-222222222222",
  displayName: "Aina Owner",
  email: "aina@example.com",
  status: "Active",
  planCode: "Free",
  planName: "Free Plan",
  profileComplete: true,
  contactReady: true,
  contactSummary: "Phone and WhatsApp · +60 •••• 3333",
  finderReadyPetCount: 1,
  finderContactIssuePetCount: 1,
  petCount: 2,
  activePetCount: 2,
  memorialPetCount: 0,
  archivedPetCount: 0,
  lostModePetCount: 1,
  orderCount: 1,
  pendingPaymentOrderCount: 1,
  pendingProofCount: 1,
  activeFulfilmentOrderCount: 0,
  deliveredOrderCount: 0,
  activeSmartTagCount: 1,
  totalSmartTagCount: 1,
  memoryCount: 2,
  maxPets: 3,
  maxMemoriesPerPet: 10,
  petUsageNearLimit: false,
  memoryUsageNearLimit: true,
  joinedAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-16T07:42:00Z",
};

const counts: AdminOwnerCounts = { all: 12, active: 10, suspended: 1, missingContact: 2, noPets: 3 };

beforeEach(() => {
  mocks.listOwners.mockResolvedValue({ items: [owner], total: 12 });
  mocks.countOwners.mockResolvedValue(counts);
  mocks.downloadExport.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminUsersManager", () => {
  it("uses the shared table with server paging, filters, sorting, and aggregate counts", async () => {
    render(<AdminUsersManager />);

    await screen.findByText("aina@example.com");
    expect(mocks.listOwners).toHaveBeenCalledWith(expect.objectContaining({
      page: 2,
      pageSize: 20,
      search: "aina",
      status: "Active",
      contactReady: "true",
      hasPets: "true",
      memoryUsageNearLimit: "true",
      sortBy: "joinedAt",
      sortDir: "desc",
    }), expect.any(AbortSignal));
    expect(mocks.countOwners).toHaveBeenCalledWith(expect.any(Object), expect.any(AbortSignal));
    const summary = screen.getByLabelText("Owner account summary");
    expect(within(summary).getByText("12").closest("span")?.textContent).toContain("All owners");
    expect(within(summary).getByText("2").closest("span")?.textContent).toContain("Missing contact");
  });

  it("keeps same-name accounts distinct and uses centralized owner filters for related modules", async () => {
    mocks.listOwners.mockResolvedValue({
      items: [owner, { ...owner, ownerUserId: "94444444-4444-4444-8444-444444444444", email: "aina.two@example.com" }],
      total: 2,
    });
    render(<AdminUsersManager />);

    const menus = await screen.findAllByRole("button", { name: /More actions for Aina Owner/ });
    expect(menus).toHaveLength(2);
    expect(menus[0].getAttribute("aria-label")).toContain("aina@example.com");
    expect(menus[1].getAttribute("aria-label")).toContain("aina.two@example.com");

    fireEvent.click(menus[0]);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "View Pet Profiles" }).getAttribute("href")).toBe("/admin/pets?ownerId=92222222-2222-4222-8222-222222222222");
    expect(within(menu).getByRole("menuitem", { name: "View Orders" }).getAttribute("href")).toBe("/admin/orders?ownerId=92222222-2222-4222-8222-222222222222");
    expect(within(menu).getByRole("menuitem", { name: "View Smart Tags" }).getAttribute("href")).toBe("/admin/tags?ownerId=92222222-2222-4222-8222-222222222222");
    expect(within(menu).getByRole("menuitem", { name: "View Payment Proofs" }).getAttribute("href")).toBe("/admin/payment-proofs?ownerId=92222222-2222-4222-8222-222222222222");
    expect(within(menu).queryByText(/Suspend|Impersonate|Edit owner/i)).toBeNull();
  });

  it("shows the shared retry state without falling back to local owner records", async () => {
    mocks.listOwners.mockRejectedValueOnce(new Error("offline"));
    render(<AdminUsersManager />);

    await screen.findByText("We couldn't load owner accounts. Please try again.");
    expect(screen.queryByText("aina@example.com")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(mocks.listOwners).toHaveBeenCalledTimes(2));
  });
});
