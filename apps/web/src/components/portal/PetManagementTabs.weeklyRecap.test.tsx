// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  weeklyRecapEnabled: true,
}));

vi.mock("@/lib/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/features")>();
  return {
    ...actual,
    get weeklyRecapEnabled() {
      return mocks.weeklyRecapEnabled;
    },
  };
});
vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return { ...actual, getPetById: (...args: unknown[]) => mocks.getPetById(...args) };
});
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));
vi.mock("@/components/qr/QrCodeButton", () => ({
  QrCodeButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const { PetManagementTabs } = await import("./PetManagementTabs");

beforeEach(() => {
  mocks.weeklyRecapEnabled = true;
  mocks.getPetById.mockResolvedValue({ data: structuredClone(mockPets[0]) });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderHub(overrides: Partial<(typeof mockPets)[number]> = {}) {
  const pet = { ...structuredClone(mockPets[0]), ...overrides };
  // The hub refreshes the pet on mount; keep the refreshed copy the same.
  mocks.getPetById.mockResolvedValue({ data: pet });
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);
  return pet;
}

describe("Weekly Recap from the pet's page", () => {
  it("opens the pet's week from its Moments card", async () => {
    const pet = renderHub();

    const link = await screen.findByRole("link", { name: `See ${pet.name}'s week` });
    expect(link.getAttribute("href")).toBe(`/recap?pet=${pet.id}&from=pet_hub`);
  });

  it("stays available while the pet is in Lost Mode", async () => {
    const pet = renderHub({ lostModeEnabled: true });

    expect(await screen.findByRole("link", { name: `See ${pet.name}'s week` })).toBeTruthy();
  });

  it("is absent for a memorial pet and while the feature is off", async () => {
    const pet = renderHub({ lifecycleStatus: "Memorial" });
    await screen.findByText("Sharing & Privacy");
    expect(screen.queryByRole("link", { name: `See ${pet.name}'s week` })).toBeNull();
    cleanup();

    mocks.weeklyRecapEnabled = false;
    renderHub();
    await screen.findByText("Sharing & Privacy");
    expect(screen.queryByRole("link", { name: /'s week$/ })).toBeNull();
  });
});
