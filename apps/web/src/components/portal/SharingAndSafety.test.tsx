// @vitest-environment jsdom

/**
 * Layout contract for the Sharing & Safety section: the two profiles are equal
 * siblings, and Lost Mode sits beside them rather than inside the safety half.
 * An earlier version gave Safety three buttons and a highlighted metadata block
 * while Public Profile had a single row, which made the finder-facing half look
 * like the important one.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  updatePetLostMode: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/lib/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/features")>();
  return {
    ...actual,
    publicProfilesEnabled: true,
    safetyProfilesOwnerUiEnabled: true,
    smartTagsEnabled: true,
  };
});
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    updatePetLostMode: (...args: unknown[]) => mocks.updatePetLostMode(...args),
  };
});
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));

const { PetManagementTabs } = await import("./PetManagementTabs");

function activePet(overrides: Partial<Pet> = {}): Pet {
  return { ...structuredClone(mockPets[0]), ...overrides };
}

function renderOverview(pet: Pet) {
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);
}

function subcardFor(name: string) {
  return screen.getByRole("group", { name: `${name} overview` });
}

beforeEach(() => {
  const pet = activePet();
  mocks.getPetById.mockResolvedValue({ data: pet });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
  mocks.updatePetLostMode.mockResolvedValue({ data: pet });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Sharing & Safety layout", () => {
  it("keeps Privacy absent when Public Profiles, Safety Profiles, and Smart Tags are enabled", async () => {
    renderOverview(activePet());
    await screen.findByText("Sharing & Safety");

    expect(screen.queryByRole("tab", { name: "Privacy" })).toBeNull();
    expect(screen.queryByText("Public profile visibility")).toBeNull();
    expect(screen.queryByText("Safety Profile visibility")).toBeNull();
    expect(screen.queryByText(/Public profile is (on|off)/i)).toBeNull();
    expect(within(subcardFor("Public Profile")).getByText("Shared")).toBeTruthy();
  });

  it("gives both profiles a status, description, management action, and view link", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Safety");

    const publicCard = subcardFor("Public Profile");
    const safetyCard = subcardFor("Safety Profile");
    expect(publicCard).toBeTruthy();
    expect(safetyCard).toBeTruthy();

    expect(within(publicCard!).queryByRole("button")).toBeNull();
    expect(
      within(publicCard!).queryByRole("link", { name: "Manage sharing & safety" })
    ).toBeNull();
    expect(within(publicCard!).getByRole("link", { name: "View profile" })).toBeTruthy();
    expect(within(publicCard!).getByText("Shared")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Manage sharing & safety" })
    ).toBeTruthy();

    expect(safetyCard!.querySelectorAll("button")).toHaveLength(1);
    expect(within(safetyCard!).getByRole("link", { name: "View profile" })).toBeTruthy();
    expect(
      safetyCard!.querySelector("button")?.getAttribute("aria-label")
    ).toBe(`Show ${pet.name}'s Safety Profile QR code`);
  });

  it("keeps both profile links pointing at their own page", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Safety");

    expect(
      within(subcardFor("Public Profile"))
        .getByRole("link", { name: "View profile" })
        .getAttribute("href")
    ).toContain(pet.publicProfilePath);
    expect(
      within(subcardFor("Safety Profile"))
        .getByRole("link", { name: "View profile" })
        .getAttribute("href")
    ).toBe(pet.qrSafetyPath);
  });

  it("routes sharing and safety settings to their current Edit Pet tabs", async () => {
    const pet = activePet({ hasUsableSafetyContact: false });
    mocks.getPetById.mockResolvedValue({ data: pet });
    renderOverview(pet);
    await screen.findByText("Sharing & Safety");

    expect(
      screen.getByRole("link", { name: "Manage sharing & safety" }).getAttribute(
        "href"
      )
    ).toBe(`/pets/${pet.id}/edit?tab=public`);
    expect(
      screen.getByRole("link", { name: /Update contact/ }).getAttribute("href")
    ).toBe(`/pets/${pet.id}/edit?tab=contact`);
  });

  it("does not repeat Copy Link, which belongs to the Share Center", async () => {
    renderOverview(activePet());
    await screen.findByText("Sharing & Safety");

    expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Copy Safety Profile Link/ })
    ).toBeNull();
  });

  it("shows the general area as one line of metadata, not a highlighted block", async () => {
    const pet = activePet({ contactOverride: { useOwnerDefaults: false } });
    mocks.getPetById.mockResolvedValue({ data: pet });
    renderOverview(pet);
    await screen.findByText("Sharing & Safety");

    const meta = screen.getByText(/^General area ·/);
    expect(meta.tagName).toBe("P");
    expect(subcardFor("Safety Profile")!.contains(meta)).toBe(true);
    // The old treatment was a filled panel with its own uppercase label.
    expect(screen.queryByText("General area")).toBeNull();
  });

  it("places Lost Mode beside the two profiles, not inside the safety one", async () => {
    renderOverview(activePet());
    await screen.findByText("Sharing & Safety");

    const lostHeading = screen.getByRole("heading", { name: "Lost Mode" });
    expect(subcardFor("Safety Profile")!.contains(lostHeading)).toBe(false);
    expect(subcardFor("Public Profile")!.contains(lostHeading)).toBe(false);
  });

  it("keeps the resting Lost Mode quiet, with no urgent styling", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Safety");

    const turnOn = screen.getByRole("button", { name: "Turn on Lost Mode" });
    expect(turnOn.className).not.toMatch(/coral/);
    expect(screen.getByText(`Only turn this on if ${pet.name} is missing.`))
      .toBeTruthy();

    // The confirmation step is where urgency belongs.
    fireEvent.click(turnOn);
    const activate = await screen.findByRole("button", {
      name: "Activate Lost Mode",
    });
    expect(activate.className).toMatch(/coral/);
  });
});
