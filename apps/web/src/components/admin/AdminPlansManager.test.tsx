// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminOwnerPlan,
  AdminOwnerPlanCounts,
  AdminPlanDefinition,
} from "@/services/adminPlanService";
import { AdminPlansManager } from "./AdminPlansManager";

const mocks = vi.hoisted(() => ({
  listDefinitions: vi.fn(),
  listOwnerPlans: vi.fn(),
  countOwnerPlans: vi.fn(),
  downloadExport: vi.fn(),
  getDetail: vi.fn(),
  setFilter: vi.fn(),
  setFilters: vi.fn(),
  clearAllFilters: vi.fn(),
  setPage: vi.fn(),
  setPageSize: vi.fn(),
  setSearch: vi.fn(),
  setSort: vi.fn(),
  setExtraParam: vi.fn(),
  view: "definitions",
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/table/useAdminTableQuery")>();
  return {
    ...actual,
    useAdminTableQuery: () => ({
      query: {
        page: 1,
        pageSize: 20,
        search: "aina",
        sortBy: "updatedAt",
        sortDir: "desc",
        filters: { plan: "Free", petUsage: "at" },
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
        getExtraParam: (key: string) => (key === "view" ? mocks.view : ""),
      },
    }),
  };
});

vi.mock("@/services/adminPlanService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminPlanService")>();
  return {
    ...actual,
    listAdminPlanDefinitions: mocks.listDefinitions,
    listAdminOwnerPlans: mocks.listOwnerPlans,
    countAdminOwnerPlans: mocks.countOwnerPlans,
    downloadAdminOwnerPlansExport: mocks.downloadExport,
    getAdminOwnerPlanDetail: mocks.getDetail,
    getAdminOwnerPlanExportFormats: () => ["csv", "xlsx"],
  };
});

const freeDefinition: AdminPlanDefinition = {
  id: "plan-free",
  code: "Free",
  name: "Free Plan",
  status: "Available",
  isArchived: false,
  priceLabel: "RM0",
  billingNote: "Available now",
  maxPets: 3,
  maxMemoriesPerPet: 10,
  maxMediaPerMemory: 5,
  maxFamilyMembers: 0,
  maxCareRecords: 100,
  scanHistoryDays: 0,
  allowsSmartTagAddOns: true,
  allowsFoundReports: true,
  allowsAdvancedThemes: false,
  ownerCount: 12,
};

const premiumDefinition: AdminPlanDefinition = {
  ...freeDefinition,
  id: "plan-premium",
  code: "Premium",
  name: "Premium Plan",
  status: "ComingSoon",
  priceLabel: "Coming Soon",
  maxPets: 10,
  maxMemoriesPerPet: 100,
  allowsAdvancedThemes: true,
  ownerCount: 0,
};

const ownerPlan: AdminOwnerPlan = {
  ownerUserId: "92222222-2222-4222-8222-222222222222",
  displayName: "Aina Owner",
  email: "aina@example.com",
  planCode: "Free",
  planName: "Free Plan",
  planStatus: "Available",
  petCount: 4,
  activePetCount: 3,
  maxPets: 3,
  petUsageState: "At",
  totalMemoryCount: 9,
  highestMemoriesOnPet: 8,
  maxMemoriesPerPet: 10,
  memoryUsageState: "Near",
  careRecordCount: 2,
  maxCareRecords: 100,
  hasOverride: false,
  grandfathered: true,
  assignedAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-16T07:42:00Z",
};

const counts: AdminOwnerPlanCounts = {
  all: 12,
  nearPetLimit: 1,
  atPetLimit: 4,
  overPetLimit: 2,
  withOverride: 3,
};

beforeEach(() => {
  mocks.view = "definitions";
  mocks.listDefinitions.mockResolvedValue([freeDefinition, premiumDefinition]);
  mocks.listOwnerPlans.mockResolvedValue({ items: [ownerPlan], total: 12 });
  mocks.countOwnerPlans.mockResolvedValue(counts);
  mocks.downloadExport.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminPlansManager — plan definitions", () => {
  it("shows read-only definitions with limits, availability, and owner counts", async () => {
    render(<AdminPlansManager />);

    await screen.findByText("Free Plan");
    expect(screen.getByText("Premium Plan")).toBeDefined();
    expect(screen.getAllByText("Coming Soon").length).toBeGreaterThan(0);
    expect(screen.getByText(/read-only here/)).toBeDefined();

    const freeRow = screen.getByText("Free Plan").closest("tr")!;
    expect(within(freeRow).getByText("3")).toBeDefined();
    expect(within(freeRow).getByText("10")).toBeDefined();
    expect(within(freeRow).getByText("12")).toBeDefined();
    expect(
      within(freeRow).getByRole("link", { name: "View Owners" }).getAttribute("href")
    ).toBe("/admin/plans?view=owners&plan=Free");

    // Read-only: no editing or fake billing controls anywhere.
    expect(screen.queryByRole("button", { name: /Save|Edit|Delete|Retire/ })).toBeNull();
  });

  it("treats an empty definitions list as a configuration problem", async () => {
    mocks.listDefinitions.mockResolvedValue([]);
    render(<AdminPlansManager />);

    await screen.findByText(/configuration problem/);
  });

  it("offers retry when definitions fail to load", async () => {
    mocks.listDefinitions.mockRejectedValueOnce(new Error("offline"));
    render(<AdminPlansManager />);

    await screen.findByText(/couldn't load the plan definitions/);
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(mocks.listDefinitions).toHaveBeenCalledTimes(2));
  });
});

describe("AdminPlansManager — owner plans", () => {
  beforeEach(() => {
    mocks.view = "owners";
  });

  it("lists owner plans through the shared table with server-side params", async () => {
    render(<AdminPlansManager />);

    await screen.findByText("aina@example.com");
    expect(mocks.listOwnerPlans).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        search: "aina",
        plan: "Free",
        petUsage: "at",
        sortBy: "updatedAt",
        sortDir: "desc",
      }),
      expect.any(AbortSignal)
    );

    const summary = screen.getByLabelText("Owner plan summary");
    expect(within(summary).getByText("12").closest("span")?.textContent).toContain("All owners");
    expect(within(summary).getByText("3").closest("span")?.textContent).toContain("Manual overrides");
  });

  it("communicates usage with text, not only color", async () => {
    render(<AdminPlansManager />);

    const row = (await screen.findByText("aina@example.com")).closest("tr")!;
    expect(within(row).getByText("At limit")).toBeDefined();
    expect(within(row).getByText("Near limit")).toBeDefined();
    expect(within(row).getByText("3 / 3")).toBeDefined();
    expect(within(row).getByText("Legacy")).toBeDefined();
  });

  it("keeps row actions read-only navigation without plan mutations", async () => {
    render(<AdminPlansManager />);

    const menuButton = await screen.findByRole("button", {
      name: /More actions for Aina Owner/,
    });
    fireEvent.click(menuButton);
    const menu = screen.getByRole("menu");

    expect(
      within(menu).getByRole("menuitem", { name: "View Owner" }).getAttribute("href")
    ).toBe("/admin/users?owner=92222222-2222-4222-8222-222222222222");
    expect(within(menu).getByRole("menuitem", { name: "View Pet Profiles" })).toBeDefined();
    expect(within(menu).getByRole("menuitem", { name: "View Orders" })).toBeDefined();
    expect(within(menu).queryByText(/Change Plan|Upgrade|Downgrade|Cancel/i)).toBeNull();
  });

  it("opens the plan detail drawer through URL state", async () => {
    render(<AdminPlansManager />);

    fireEvent.click(await screen.findByRole("button", { name: "View Plan Details" }));
    expect(mocks.setExtraParam).toHaveBeenCalledWith(
      "ownerPlan",
      "92222222-2222-4222-8222-222222222222"
    );
  });

  it("shows the shared retry state without local fallbacks after failures", async () => {
    mocks.listOwnerPlans.mockRejectedValueOnce(new Error("offline"));
    render(<AdminPlansManager />);

    await screen.findByText("We couldn't load owner plans. Please try again.");
    expect(screen.queryByText("aina@example.com")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(mocks.listOwnerPlans).toHaveBeenCalledTimes(2));
  });

  it("exports filtered and selected rows via the shared export menu", async () => {
    render(<AdminPlansManager />);
    await screen.findByText("aina@example.com");

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Export all filtered rows as Excel" })
    );

    await waitFor(() =>
      expect(mocks.downloadExport).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "Free", petUsage: "at" }),
        "xlsx",
        undefined
      )
    );
  });
});
