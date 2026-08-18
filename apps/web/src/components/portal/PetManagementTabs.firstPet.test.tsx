// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  getPets: vi.fn(),
  ownerPets: null as Pet[] | null,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/components/portal/OwnerHeaderActions", () => ({
  useOwnerPets: () => ({
    pets: mocks.ownerPets,
    petsStatus: mocks.ownerPets ? "ready" : "loading",
  }),
}));

vi.mock("@/components/share/PetShareCard", () => ({
  PetShareCard: () => <button type="button">Share Card</button>,
}));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    getPets: (...args: unknown[]) => mocks.getPets(...args),
  };
});

vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));

vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));

vi.mock("@/components/qr/QrCodeButton", () => ({
  QrCodeButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

const { PetManagementTabs } = await import("./PetManagementTabs");

/** A pet with obvious gaps, so the completion card and its heading render. */
function incompletePet(overrides: Partial<Pet> = {}): Pet {
  return {
    ...structuredClone(mockPets[0]),
    photoUrl: "",
    bio: "",
    personalityTags: [],
    ...overrides,
  } as Pet;
}

function renderTabs(pet: Pet) {
  return render(
    <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
  );
}

beforeEach(() => {
  mocks.ownerPets = null;
  const pet = incompletePet();
  mocks.getPetById.mockResolvedValue({ data: pet });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
  mocks.getPets.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("first-pet completion heading", () => {
  it("welcomes the owner's only active pet with the first-pet heading", async () => {
    const pet = incompletePet();
    mocks.ownerPets = [pet];

    renderTabs(pet);

    expect(
      await screen.findByRole("heading", { name: `Finish ${pet.name}'s profile` })
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: `Add more about ${pet.name}` })
    ).toBeNull();
  });

  it("uses the returning wording once the owner has more than one active pet", async () => {
    const pet = incompletePet();
    mocks.ownerPets = [pet, incompletePet({ id: "pet_second", name: "Luna" })];

    renderTabs(pet);

    expect(
      await screen.findByRole("heading", { name: `Add more about ${pet.name}` })
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: `Finish ${pet.name}'s profile` })
    ).toBeNull();
  });

  it("counts only active pets, so archived and memorial pets do not hide the first-pet heading", async () => {
    const pet = incompletePet();
    mocks.ownerPets = [
      pet,
      incompletePet({
        id: "pet_archived",
        name: "Archived",
        lifecycleStatus: "Archived",
      }),
      incompletePet({
        id: "pet_memorial",
        name: "Memorial",
        lifecycleStatus: "Memorial",
      }),
    ];

    renderTabs(pet);

    expect(
      await screen.findByRole("heading", { name: `Finish ${pet.name}'s profile` })
    ).toBeTruthy();
  });

  it("falls back to the neutral heading while the owner's pets are still unknown", async () => {
    const pet = incompletePet();
    mocks.ownerPets = null;

    renderTabs(pet);

    expect(
      await screen.findByRole("heading", { name: `Add more about ${pet.name}` })
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: `Finish ${pet.name}'s profile` })
    ).toBeNull();
  });

  it("never requests the owner's pets itself", async () => {
    const pet = incompletePet();
    mocks.ownerPets = [pet];

    renderTabs(pet);

    await screen.findByRole("heading", { name: `Finish ${pet.name}'s profile` });
    expect(mocks.getPets).not.toHaveBeenCalled();
  });

  it("keeps the sharing actions intact alongside the heading", async () => {
    const pet = incompletePet();
    mocks.ownerPets = [pet];

    renderTabs(pet);

    await screen.findByText("Sharing & Safety");
    expect(screen.getAllByRole("link", { name: "View Profile" })).toHaveLength(
      1
    );
    expect(
      screen.getAllByRole("button", { name: `Share ${pet.name}` })
    ).toHaveLength(1);
  });
});
