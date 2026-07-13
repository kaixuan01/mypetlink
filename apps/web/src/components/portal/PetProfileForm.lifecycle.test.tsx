// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { ApiClientError } from "@/services/apiClient";
import type { Pet, PetPayload } from "@/types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  router: null as null | {
    refresh: ReturnType<typeof vi.fn>;
    replace: ReturnType<typeof vi.fn>;
  },
  logoutOwner: vi.fn(),
  getPetById: vi.fn(),
  updatePet: vi.fn(),
  updatePetLifecycle: vi.fn(),
}));

mocks.router = { refresh: mocks.refresh, replace: mocks.replace };

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => false }));

vi.mock("@/services/authService", () => ({
  logoutOwner: (...args: unknown[]) => mocks.logoutOwner(...args),
}));

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

async function openPublicProfile() {
  fireEvent.click(await screen.findByRole("tab", { name: /Public Profile/ }));
}

function clickSave() {
  fireEvent.click(screen.getAllByRole("button", { name: "Save Changes" })[0]);
}

describe("PetProfileForm lifecycle workflow", () => {
  let pet: Pet;

  beforeEach(() => {
    pet = activePet();
    window.history.replaceState({}, "", `/pets/${pet.id}/edit`);
    mocks.getPetById.mockResolvedValue({ data: pet });
    mocks.updatePet.mockImplementation(
      async (_id: string, payload: PetPayload) => ({ data: { ...pet, ...payload } })
    );
    mocks.updatePetLifecycle.mockImplementation(
      async (_id: string, status: Pet["lifecycleStatus"], memorial: Pet["memorial"]) => ({
        data: { ...pet, lifecycleStatus: status, memorial: { ...pet.memorial, ...memorial } },
      })
    );
    mocks.replace.mockReset();
    mocks.logoutOwner.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("marks the saved Active state as Current and stages Memorial locally", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPublicProfile();

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
    await openPublicProfile();
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

  it("confirms Active to Archived and has no duplicate lifecycle action buttons", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPublicProfile();

    expect(screen.queryByRole("button", { name: "Move to Memorial" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive Pet" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^Archived/ }));
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();
    clickSave();

    expect(screen.getByText("Archive this pet profile?")).toBeTruthy();
  });

  it("requires an archived profile to restore to Active before Memorial", async () => {
    pet = { ...pet, lifecycleStatus: "Archived", previousLifecycleStatus: "Memorial" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPublicProfile();

    expect(screen.getByRole("radio", { name: /^Memorial/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("radio", { name: /^Active/ }).hasAttribute("disabled")).toBe(false);
  });

  it("shows Pet Not Found only after an authenticated pet lookup returns empty", async () => {
    mocks.getPetById.mockResolvedValueOnce({ data: null });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    expect(await screen.findByText("Pet not found")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("shows a retryable error instead of Pet Not Found for a connection failure", async () => {
    mocks.getPetById.mockRejectedValueOnce(
      new ApiClientError(0, "service_unavailable", "Please try again")
    );
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    expect(
      await screen.findByText("This pet profile is temporarily unavailable.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(screen.queryByText("Pet not found")).toBeNull();
  });

  it("redirects if the session expires during edit-page revalidation", async () => {
    mocks.getPetById.mockRejectedValueOnce(
      new ApiClientError(401, "unauthorized", "Session expired")
    );
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    await waitFor(() => expect(mocks.logoutOwner).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent(`/pets/${pet.id}/edit`)}`
    );
    expect(screen.queryByText("Pet not found")).toBeNull();
  });

  it("redirects to login when the session expires while saving", async () => {
    window.history.replaceState({}, "", `/pets/${pet.id}/edit?tab=photos`);
    mocks.updatePet.mockRejectedValueOnce(
      new ApiClientError(401, "unauthorized", "Session expired")
    );
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    await screen.findByRole("tab", { name: /Basic Info/ });
    clickSave();

    await waitFor(() => expect(mocks.logoutOwner).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent(
        `/pets/${pet.id}/edit?tab=photos`
      )}`
    );
    expect(screen.queryByText("Session expired")).toBeNull();
  });

  it("initializes, saves, and reloads favourite food and toy values", async () => {
    pet = {
      ...pet,
      favoriteFood: "Ikan kembung 🐟",
      favoriteToy: "毛绒小鼠 🐭",
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    const food = await screen.findByLabelText("Favourite food");
    const toy = screen.getByLabelText("Favourite toy");
    expect(food).toHaveProperty("value", "Ikan kembung 🐟");
    expect(toy).toHaveProperty("value", "毛绒小鼠 🐭");
    expect(food).toHaveProperty("maxLength", 80);
    expect(toy).toHaveProperty("maxLength", 80);

    fireEvent.change(food, { target: { value: "参巴 ikan 🐟" } });
    fireEvent.change(toy, { target: { value: "Bola kegemaran 🎾" } });
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({
          favoriteFood: "参巴 ikan 🐟",
          favoriteToy: "Bola kegemaran 🎾",
        })
      )
    );
    expect(await screen.findByDisplayValue("参巴 ikan 🐟")).toBeTruthy();
    expect(screen.getByDisplayValue("Bola kegemaran 🎾")).toBeTruthy();
  });

  it("sends explicit empty values when both favourite fields are cleared", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    const food = await screen.findByLabelText("Favourite food");
    const toy = screen.getByLabelText("Favourite toy");

    fireEvent.change(food, { target: { value: "" } });
    fireEvent.change(toy, { target: { value: "" } });
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ favoriteFood: "", favoriteToy: "" })
      )
    );
    expect(screen.getByLabelText("Favourite food")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Favourite toy")).toHaveProperty("value", "");
  });
});
