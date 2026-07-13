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
    return null;
  },
}));
vi.mock("@/components/portal/PlanAwareAddPetButton", () => ({
  PlanAwareAddPetButton: () => <button type="button">Add Pet</button>,
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
    await screen.findByText("No active pets yet");
    expect(mocks.planSummaryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialMoments: [],
        initialPets: [],
        refreshOnMount: false,
      })
    );
  });

  it("renders the legitimate empty state for an empty API response", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });
    renderDashboard();

    expect(await screen.findByText("No active pets yet")).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
  });

  it("renders a retryable error without falling back to mock pets", async () => {
    mocks.getPets.mockRejectedValue(new Error("offline"));
    renderDashboard();

    expect(await screen.findByText("Could not load your dashboard")).toBeTruthy();
    expect(screen.getByText("Please try again.")).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
    await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
  });
});
