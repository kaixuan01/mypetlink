// @vitest-environment jsdom

/**
 * Owner-visible availability of the Share Pet Card, exercised through the two
 * surfaces owners actually use.
 *
 * These tests deliberately do NOT stub NEXT_PUBLIC_SHARE_CARDS_ENABLED and do
 * NOT mock @/lib/features or PetShareCard. The first version of the Share
 * Center shipped with the card action invisible because every suite forced the
 * flag on, so the shipped default was never rendered. Keep this file free of
 * feature-flag stubs.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPets: (...args: unknown[]) => mocks.getPets(...args),
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    getFriendlyApiErrorMessage: () => "Please try again.",
  };
});
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));
vi.mock("@/components/portal/PlanSummaryCard", () => ({
  PlanSummaryCard: () => <div data-testid="plan-summary-card" />,
}));

const { DashboardClient } = await import("@/components/portal/DashboardClient");
const { PetManagementTabs } = await import(
  "@/components/portal/PetManagementTabs"
);

/** 17 Aug — a plain day for this pet, with neither anniversary falling on it. */
const ORDINARY_DAY = new Date("2026-08-17T02:00:00Z");

function eligiblePet(overrides: Partial<Pet> = {}): Pet {
  return {
    ...structuredClone(mockPets[0]),
    birthday: "2021-04-02",
    adoptionDay: "2022-11-30",
    publicProfileEnabled: true,
    ...overrides,
  };
}

function shareCardTrigger() {
  return screen.queryByRole("button", { name: /Share Pet Card/ });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(ORDINARY_DAY);
  mocks.getPets.mockResolvedValue({ data: [] });
  mocks.getPetById.mockResolvedValue({ data: null });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Share Pet Card availability", () => {
  it("is offered from the Dashboard pet card for an eligible public pet", async () => {
    const pet = eligiblePet();
    mocks.getPets.mockResolvedValue({ data: [pet] });

    render(
      <DashboardClient
        initialMoments={[]}
        initialPets={[pet]}
        initialRecords={[]}
      />
    );

    const share = await screen.findAllByRole("button", {
      name: new RegExp(`Share ${pet.name}`),
    });
    fireEvent.click(share[0]);
    expect(shareCardTrigger()).toBeTruthy();
  });

  it("is offered from the pet detail page for an eligible public pet", () => {
    const pet = eligiblePet();
    mocks.getPetById.mockResolvedValue({ data: pet });

    render(
      <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: `Share ${pet.name}` })[0]
    );
    expect(shareCardTrigger()).toBeTruthy();
  });

  it("stays available on a day with no birthday or adoption anniversary", () => {
    const pet = eligiblePet();
    mocks.getPetById.mockResolvedValue({ data: pet });

    render(
      <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: `Share ${pet.name}` })[0]
    );
    const trigger = shareCardTrigger();
    expect(trigger).toBeTruthy();

    // The profile card is the card; occasions are not part of this decision.
    // With nothing to choose between, the card opens straight to it.
    fireEvent.click(trigger!);
    expect(screen.getAllByRole("dialog").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: /Save Image/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Birthday" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Adoption Day" })).toBeNull();
  });

  it("adds occasion cards alongside the profile card, never instead of it", () => {
    // Both anniversaries land on the fixed test date.
    const pet = eligiblePet({
      birthday: "2021-08-17",
      adoptionDay: "2022-08-17",
    });
    mocks.getPetById.mockResolvedValue({ data: pet });

    render(
      <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: `Share ${pet.name}` })[0]
    );
    const trigger = shareCardTrigger();
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger!);
    expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Birthday" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adoption Day" })).toBeTruthy();
  });

  it("is withheld while the pet's public profile is switched off", async () => {
    const pet = eligiblePet({ publicProfileEnabled: false });
    mocks.getPets.mockResolvedValue({ data: [pet] });

    render(
      <DashboardClient
        initialMoments={[]}
        initialPets={[pet]}
        initialRecords={[]}
      />
    );

    await screen.findByText(pet.name);
    const share = screen.queryAllByRole("button", {
      name: new RegExp(`Share ${pet.name}`),
    })[0];
    if (share) {
      fireEvent.click(share);
    }
    expect(shareCardTrigger()).toBeNull();
  });
});
