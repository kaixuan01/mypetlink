// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

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
    expect(await screen.findByText("Milo")).toBeTruthy();
    expect(screen.queryByText("Could not load your dashboard")).toBeNull();
  });
});

describe("DashboardClient with pets", () => {
  beforeEach(() => {
    mocks.getPets.mockResolvedValue({ data: [mockPets[0]] });
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

  it("has no Add Pet button in the welcome area or quick actions", async () => {
    renderDashboard();

    await screen.findByText("Milo");
    // The only global create entry point lives in the app shell, not the page.
    expect(screen.queryByRole("button", { name: /add pet/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^add pet$/i })).toBeNull();
    expect(screen.queryByText("Add your first pet")).toBeNull();
  });

  it("shows quick actions without a duplicate Add Pet destination", async () => {
    renderDashboard();

    await screen.findByText("Quick actions");
    const quickLabels = ["Care Records", "Moments", "QR Safety Page", "Orders"];
    for (const label of quickLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("uses singular statistic labels for a single pet", async () => {
    renderDashboard();

    await screen.findByText("Milo");
    expect(screen.getByText("active pet")).toBeTruthy();
    expect(screen.getByText("QR safety page")).toBeTruthy();
    expect(screen.getByText("pending orders")).toBeTruthy();
  });

  it("renders Your Pets above Plan usage", async () => {
    renderDashboard();

    await screen.findByText("Milo");
    const body = document.body.textContent ?? "";
    expect(body.indexOf("Your pets")).toBeGreaterThan(-1);
    expect(body.indexOf("Your pets")).toBeLessThan(body.indexOf("Plan usage"));
  });

  it("passes dashboard-loaded data into the plan card without re-fetching", async () => {
    renderDashboard();

    await screen.findByText("Milo");
    expect(mocks.planSummaryProps).toHaveBeenCalledWith(
      expect.objectContaining({ refreshOnMount: false })
    );
  });
});
