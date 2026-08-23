// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
  };
});
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));

const { PetManagementTabs } = await import("./PetManagementTabs");

function incompletePet(): Pet {
  return {
    ...structuredClone(mockPets[0]),
    photoUrl: "",
    gender: "",
    personalityTags: [],
    birthday: "Not set",
    estimatedBirthYear: undefined,
    bio: "",
  };
}

function completePet(): Pet {
  return {
    ...structuredClone(mockPets[0]),
    photoUrl: "https://cdn.example.test/milo.jpg",
    breed: "Poodle",
    gender: "Male",
    personalityTags: ["Playful"],
    birthday: "2023-10-12",
    estimatedBirthYear: undefined,
    bio: "Gentle and curious.",
  };
}

function expectBefore(first: Element, second: Element) {
  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
  ).not.toBe(0);
}

function renderOverview(pet: Pet, hasContent: boolean) {
  const moments = hasContent ? [structuredClone(mockMoments[0])] : [];
  const records = hasContent ? [structuredClone(mockRecords[0])] : [];
  mocks.getPetById.mockResolvedValue({ data: pet });
  mocks.getPetMoments.mockResolvedValue({ data: moments });
  mocks.getPetRecords.mockResolvedValue({ data: records });

  return render(
    <PetManagementTabs
      moments={moments}
      pet={pet}
      records={records}
      tags={[]}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Pet Overview completion ordering", () => {
  it("orders an incomplete active pet as Completion, Moments, Care, then Sharing", async () => {
    const pet = incompletePet();
    const { container } = renderOverview(pet, false);

    await waitFor(() =>
      expect(
        container.querySelector('[data-profile-completion="full"]')
      ).toBeTruthy()
    );
    const completion = container.querySelector(
      '[data-profile-completion="full"]'
    )!;
    const moments = screen.getByRole("heading", { name: "Pet Memories" });
    const care = screen.getByRole("heading", { name: "Recent care records" });
    const sharing = screen.getByRole("heading", { name: "Sharing & Safety" });

    expectBefore(completion, moments);
    expectBefore(moments, care);
    expectBefore(care, sharing);
  });

  it("starts a complete active pet with Moments, Care, then Sharing and no completion card", async () => {
    const pet = completePet();
    const { container } = renderOverview(pet, true);

    await screen.findByRole("heading", { name: "Sharing & Safety" });
    expect(
      container.querySelector('[data-profile-completion="full"]')
    ).toBeNull();
    expect(screen.queryByText("100% complete")).toBeNull();

    const moments = screen.getByRole("heading", { name: "Pet Memories" });
    const care = screen.getByRole("heading", { name: "Recent care records" });
    const sharing = screen.getByRole("heading", { name: "Sharing & Safety" });
    expectBefore(moments, care);
    expectBefore(care, sharing);
  });
});
