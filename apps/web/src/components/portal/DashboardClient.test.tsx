// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { mockTags } from "@/data/mockTags";
import { OWNER_SETTINGS_STORAGE_KEY } from "@/lib/ownerSettings";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  getAllTags: vi.fn(),
  getOrders: vi.fn(),
  planSummaryProps: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => true }));
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
  getFriendlyApiErrorMessage: () => "Please try again.",
}));
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));
vi.mock("@/services/tagService", () => ({
  getAllTags: (...args: unknown[]) => mocks.getAllTags(...args),
  getOrders: (...args: unknown[]) => mocks.getOrders(...args),
}));
vi.mock("@/components/portal/PlanSummaryCard", () => ({
  PlanSummaryCard: (props: unknown) => {
    mocks.planSummaryProps(props);
    return <div data-testid="plan-summary-card" />;
  },
}));

const { DashboardClient } = await import("./DashboardClient");

function renderDashboard() {
  render(
    <DashboardClient
      initialMoments={[]}
      initialOrders={[]}
      initialPets={[mockPets[0]]}
      initialRecords={[]}
      initialTags={[]}
    />
  );
}

describe("DashboardClient API-mode initialization", () => {
  beforeEach(() => {
    mocks.getPets.mockReset();
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    mocks.getAllTags.mockResolvedValue({ data: [] });
    mocks.getOrders.mockResolvedValue({ data: [] });
    mocks.planSummaryProps.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading without rendering server-provided mock pets and fetches once", async () => {
    let resolvePets: ((value: { data: never[] }) => void) | undefined;
    mocks.getPets.mockReturnValue(
      new Promise((resolve) => {
        resolvePets = resolve;
      })
    );

    renderDashboard();

    expect(screen.getByText("Loading owner portal")).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
    expect(mocks.getPets).toHaveBeenCalledOnce();

    resolvePets?.({ data: [] });
    await screen.findByText("Welcome to MyPetLink");
  });

  it("shows the zero-pet onboarding empty state for an empty API response", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });
    renderDashboard();

    expect(await screen.findByText("Welcome to MyPetLink")).toBeTruthy();
    expect(screen.getByText("Add your first pet")).toBeTruthy();
    // No dashboard statistics or plan card for a brand-new owner.
    expect(screen.queryByTestId("plan-summary-card")).toBeNull();
    expect(screen.queryByText("Quick actions")).toBeNull();
  });

  it("renders a retryable error without falling back to mock pets", async () => {
    mocks.getPets.mockRejectedValue(new Error("offline"));
    renderDashboard();

    expect(await screen.findByText("Could not load your dashboard")).toBeTruthy();
    expect(screen.getByText("Please try again.")).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
    await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
  });

  it("keeps the dashboard usable when a secondary request fails", async () => {
    mocks.getPets.mockResolvedValue({ data: [mockPets[0]] });
    mocks.getOrders.mockRejectedValue(new Error("orders down"));
    renderDashboard();

    // Pets still render even though the orders request failed.
    expect(await screen.findAllByText("Milo")).toBeTruthy();
    expect(screen.queryByText("Could not load your dashboard")).toBeNull();
  });
});

describe("DashboardClient with pets", () => {
  beforeEach(() => {
    // API-mode pets carry the server-computed contact-readiness flag; without
    // it a locally resolved owner contact (empty in tests) would apply.
    mocks.getPets.mockResolvedValue({
      data: [{ ...mockPets[0], hasUsableSafetyContact: true }],
    });
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    mocks.getAllTags.mockResolvedValue({ data: [] });
    mocks.getOrders.mockResolvedValue({ data: [] });
    mocks.planSummaryProps.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("has no Add Pet button in the welcome area or quick actions", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    // The only global create entry point lives in the app shell, not the page.
    expect(screen.queryByRole("button", { name: /add pet/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^add pet$/i })).toBeNull();
    expect(screen.queryByText("Add your first pet")).toBeNull();
  });

  it("shows quick actions without duplicate pet management", async () => {
    renderDashboard();

    await screen.findByText("Quick actions");
    const quickLabels = [
      "Care Records",
      "Moments",
      "Safety Profile",
      "Owner Contact",
      "Orders",
    ];
    for (const label of quickLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Manage Pet")).toBeNull();
  });

  it("points Owner Contact at the correct route", async () => {
    renderDashboard();

    await screen.findByText("Quick actions");
    expect(
      screen
        .getByRole("link", { name: "Update owner contact details" })
        .getAttribute("href")
    ).toBe("/settings#owner-contact");
  });

  it("shows the contact setup reminder only when no usable contact exists", async () => {
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ phoneNumber: "", whatsappNumber: "" })
    );
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.getByText("Add your contact details")).toBeTruthy();
    expect(
      screen.getByText("Help finders contact you if your pet is lost.")
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /add contact details/i })
        .getAttribute("href")
    ).toBe("/settings#owner-contact");
  });

  it("hides the contact setup reminder once contact details exist", async () => {
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ phoneNumber: "+60123456789", whatsappNumber: "" })
    );
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.queryByText("Add your contact details")).toBeNull();
  });

  it("uses singular statistic labels for a single pet", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.getByText("active pet")).toBeTruthy();
    expect(screen.getByText("active safety profile")).toBeTruthy();
    expect(screen.getByText("active smart tags")).toBeTruthy();
    expect(screen.getByText("pending orders")).toBeTruthy();
  });

  it("puts Public Share Profile actions immediately below Welcome", async () => {
    renderDashboard();

    await screen.findByText("Share your pet profiles");
    const body = document.body.textContent ?? "";
    expect(body.indexOf("Welcome back")).toBeLessThan(
      body.indexOf("Share your pet profiles")
    );
    expect(body.indexOf("Share your pet profiles")).toBeLessThan(
      body.indexOf("Your pets")
    );

    expect(screen.getByRole("button", { name: "Copy Link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show QR" })).toBeTruthy();
    const viewProfile = screen.getByRole("link", { name: "View Profile" });
    expect(viewProfile.getAttribute("href")?.startsWith(mockPets[0].publicProfilePath)).toBe(
      true
    );
    expect(viewProfile.getAttribute("target")).toBe("_blank");
    expect(viewProfile.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("moves the active smart tag count into Welcome and removes Safety overview", async () => {
    mocks.getAllTags.mockResolvedValue({ data: [mockTags[0]] });
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.getByText("active smart tag")).toBeTruthy();
    expect(screen.queryByText("Safety overview")).toBeNull();
  });

  it("shows a one-pet Lost Mode alert linking directly to that pet", async () => {
    mocks.getPets.mockResolvedValue({
      data: [{ ...mockPets[0], lostModeEnabled: true }],
    });
    renderDashboard();

    await screen.findByText("1 pet is in Lost Mode");
    expect(
      screen.getByRole("link", { name: /1 pet is in Lost Mode/ }).getAttribute("href")
    ).toBe(`/pets/${mockPets[0].id}`);
  });

  it("links a multi-pet Lost Mode alert to the pet list", async () => {
    mocks.getPets.mockResolvedValue({
      data: mockPets.map((pet) => ({ ...pet, lostModeEnabled: true })),
    });
    renderDashboard();

    await screen.findByText("2 pets are in Lost Mode");
    expect(
      screen.getByRole("link", { name: /2 pets are in Lost Mode/ }).getAttribute("href")
    ).toBe("/pets");
  });

  it("renders Your Pets above Plan usage", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    const body = document.body.textContent ?? "";
    expect(body.indexOf("Your pets")).toBeGreaterThan(-1);
    expect(body.indexOf("Your pets")).toBeLessThan(body.indexOf("Plan usage"));
  });

  it("passes dashboard-loaded data into the plan card without re-fetching", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(mocks.planSummaryProps).toHaveBeenCalledWith(
      expect.objectContaining({ refreshOnMount: false })
    );
  });
});
