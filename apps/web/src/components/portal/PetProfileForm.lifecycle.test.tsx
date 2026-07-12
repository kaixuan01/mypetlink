// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet, PetPayload } from "@/types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  getPetById: vi.fn(),
  updatePet: vi.fn(),
  updatePetLifecycle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => false }));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    updatePet: (...args: unknown[]) => mocks.updatePet(...args),
    updatePetLifecycle: (...args: unknown[]) => mocks.updatePetLifecycle(...args),
  };
});

const { PetProfileForm } = await import("./PetProfileForm");

function activePet(): Pet {
  return {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: "Active",
    previousLifecycleStatus: "Active",
  };
}

function openPublicProfile() {
  fireEvent.click(screen.getByRole("tab", { name: /Public Profile/ }));
}

function clickSave() {
  fireEvent.click(screen.getAllByRole("button", { name: "Save Changes" })[0]);
}

describe("PetProfileForm lifecycle workflow", () => {
  let pet: Pet;

  beforeEach(() => {
    pet = activePet();
    mocks.getPetById.mockResolvedValue({ data: pet });
    mocks.updatePet.mockImplementation(
      async (_id: string, payload: PetPayload) => ({ data: { ...pet, ...payload } })
    );
    mocks.updatePetLifecycle.mockImplementation(
      async (_id: string, status: Pet["lifecycleStatus"], memorial: Pet["memorial"]) => ({
        data: { ...pet, lifecycleStatus: status, memorial: { ...pet.memorial, ...memorial } },
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("marks the saved Active state as Current and stages Memorial locally", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    openPublicProfile();

    expect(screen.getByText("Currently Active")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /^Memorial/ }));

    expect(screen.getByRole("status").textContent).toContain(
      "Status will change to Memorial when you save."
    );
    expect(screen.getByLabelText(/Date of passing, optional/)).toBeTruthy();
    expect(mocks.updatePet).not.toHaveBeenCalled();
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();
  });

  it("confirms Active to Memorial through Save Changes only", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    openPublicProfile();
    fireEvent.click(screen.getByRole("radio", { name: /^Memorial/ }));
    clickSave();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Move this profile to Memorial?")).toBeTruthy();
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();

    clickSave();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Memorial" }));

    await waitFor(() =>
      expect(mocks.updatePetLifecycle).toHaveBeenCalledWith(
        pet.id,
        "Memorial",
        expect.objectContaining({ showMemorialOnPublicProfile: true })
      )
    );
  });

  it("confirms Active to Archived and has no duplicate lifecycle action buttons", () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    openPublicProfile();

    expect(screen.queryByRole("button", { name: "Move to Memorial" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive Pet" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^Archived/ }));
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();
    clickSave();

    expect(screen.getByText("Archive this pet profile?")).toBeTruthy();
  });

  it("requires an archived profile to restore to Active before Memorial", () => {
    pet = { ...pet, lifecycleStatus: "Archived", previousLifecycleStatus: "Memorial" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    openPublicProfile();

    expect(screen.getByRole("radio", { name: /^Memorial/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("radio", { name: /^Active/ }).hasAttribute("disabled")).toBe(false);
  });
});
