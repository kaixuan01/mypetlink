// @vitest-environment jsdom

/**
 * Layout contract for the Sharing & Safety section: the two profiles are equal
 * siblings, and Lost Mode sits beside them rather than inside the safety half.
 * An earlier version gave Safety three buttons and a highlighted metadata block
 * while Public Profile had a single row, which made the finder-facing half look
 * like the important one.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/** The bordered subcard a heading belongs to. */
function subcardFor(name: string) {
  return screen.getByRole("heading", { name }).closest("div.rounded-\\[1\\.35rem\\]");
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
  it("gives both profiles the same shape: status, description, one action, one link", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Safety");

    const publicCard = subcardFor("Public Profile");
    const safetyCard = subcardFor("Safety Profile");
    expect(publicCard).toBeTruthy();
    expect(safetyCard).toBeTruthy();

    for (const card of [publicCard!, safetyCard!]) {
      // Exactly one action button and one "View profile" link per side.
      expect(card.querySelectorAll("button")).toHaveLength(1);
      const links = [...card.querySelectorAll("a")];
      expect(links).toHaveLength(1);
      expect(links[0].textContent).toContain("View profile");
    }

    expect(
      publicCard!.querySelector("button")?.textContent
    ).toContain("Share");
    expect(
      safetyCard!.querySelector("button")?.getAttribute("aria-label")
    ).toBe(`Show ${pet.name}'s Safety Profile QR code`);
  });

  it("keeps both profile links pointing at their own page", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Safety");

    expect(
      subcardFor("Public Profile")!.querySelector("a")?.getAttribute("href")
    ).toContain(pet.publicProfilePath);
    expect(
      subcardFor("Safety Profile")!.querySelector("a")?.getAttribute("href")
    ).toBe(pet.qrSafetyPath);
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
    const pet = activePet();
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
