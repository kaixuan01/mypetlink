// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { getPetSummaryLabel } from "@/lib/petDisplay";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
}));

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/momentService", () => ({
  getFriendlyMomentErrorMessage: () => "Moments unavailable.",
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getFriendlyRecordErrorMessage: () => "Records unavailable.",
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));
vi.mock("@/components/portal/PetMomentsManager", () => ({
  PetMomentsManager: ({ pet }: { pet: { name: string } }) => (
    <div>Moments for {pet.name}</div>
  ),
}));
vi.mock("@/components/portal/RecordsManager", () => ({
  RecordsManager: ({ petId }: { petId: string }) => (
    <div>Records for {petId}</div>
  ),
}));
vi.mock("@/components/portal/PetSwitcher", () => ({
  PetSwitcher: () => null,
}));

const { GenericPetSection } = await import("./GenericPetSection");

beforeEach(() => {
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("requires an explicit pet choice when multiple pets exist", async () => {
  mocks.getPets.mockResolvedValue({ data: mockPets });
  render(<GenericPetSection section="moments" />);

  expect(await screen.findByText("Choose a pet for Moments")).toBeTruthy();
  for (const pet of mockPets) {
    expect(
      screen
        .getByRole("link", { name: `Open ${pet.name}'s moments` })
        .getAttribute("href")
    ).toBe(`/pets/${pet.id}/moments`);
  }
  expect(mocks.getPetMoments).not.toHaveBeenCalled();
  expect(mocks.getPetRecords).not.toHaveBeenCalled();
});

it("opens the only pet without presenting an arbitrary choice", async () => {
  const pet = mockPets[0];
  mocks.getPets.mockResolvedValue({ data: [pet] });
  render(<GenericPetSection section="records" />);

  expect(await screen.findByText(`Records for ${pet.id}`)).toBeTruthy();
  await waitFor(() => expect(mocks.getPetRecords).toHaveBeenCalledWith(pet.id));
  expect(screen.queryByText("Choose a pet for Care Records")).toBeNull();
});

it("keeps long picker identity recoverable and allows metadata two lines", async () => {
  const longPet = {
    ...mockPets[0],
    name: "Princess Fluffington the Third of Kuala Lumpur",
    breed: "Labrador Retriever and Golden Retriever Mix",
    birthday: "Not set",
    estimatedBirthYear: 2021,
  };
  mocks.getPets.mockResolvedValue({ data: [longPet, mockPets[1]] });
  render(<GenericPetSection section="records" />);

  const name = await screen.findByText(longPet.name);
  const summary = screen.getByText(getPetSummaryLabel(longPet));

  expect(name.classList.contains("truncate")).toBe(true);
  expect(name.getAttribute("title")).toBe(longPet.name);
  expect(summary.hasAttribute("data-pet-picker-metadata")).toBe(true);
  expect(summary.textContent).toBe(getPetSummaryLabel(longPet));
  expect(summary.classList.contains("line-clamp-2")).toBe(true);
  expect(summary.classList.contains("truncate")).toBe(false);
});
