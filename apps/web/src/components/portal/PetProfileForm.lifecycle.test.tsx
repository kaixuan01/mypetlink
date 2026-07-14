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

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => false,
  isApiConfigured: () => false,
}));

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

  it("uses the shared native date control for adoption and memorial dates", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPublicProfile();

    expect(
      (await screen.findByLabelText(/Adoption day/)).classList.contains(
        "brand-date-input"
      )
    ).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /^Memorial/ }));
    expect(
      screen
        .getByLabelText(/Date of passing, optional/)
        .classList.contains("brand-date-input")
    ).toBe(true);
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

  it("loads an existing exact birthday and long custom breed without overlap-prone fallback text", async () => {
    pet = {
      ...pet,
      species: "Cat",
      breed: "Domestic Longhair",
      ageInformationMode: "ExactBirthday",
      ageSource: "ExactBirthday",
      birthday: "12 Oct 2023",
      estimatedBirthYear: undefined,
    };
    mocks.getPetById.mockResolvedValue({ data: pet });

    render(<PetProfileForm initialPet={pet} mode="edit" />);

    const birthday = (await screen.findByLabelText(
      /Exact birthday/
    )) as HTMLInputElement;
    expect(birthday.value).toBe("2023-10-12");
    expect(birthday.classList.contains("brand-date-input")).toBe(true);

    const ageMode = screen.getByLabelText(
      /Age information/
    ) as HTMLSelectElement;
    expect(ageMode.value).toBe("ExactBirthday");
    expect(ageMode.classList.contains("brand-select")).toBe(true);
    expect(screen.getByRole("button", { name: /^Breed/ }).textContent).toBe(
      "Other"
    );
    expect((screen.getByLabelText("Enter breed") as HTMLInputElement).value).toBe(
      "Domestic Longhair"
    );
  });

  it("initializes, saves, and reloads favourite food and toy lists", async () => {
    pet = {
      ...pet,
      favoriteFoods: ["Ikan kembung 🐟"],
      favoriteToys: ["毛绒小鼠 🐭"],
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    // Saved values load as removable chips.
    expect(
      await screen.findByRole("button", { name: "Remove Ikan kembung 🐟" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove 毛绒小鼠 🐭" })
    ).toBeTruthy();

    // Add a second food through the custom input.
    const foodInput = screen.getByLabelText("Favourite foods: add your own");
    fireEvent.change(foodInput, { target: { value: "参巴 ikan 🐟" } });
    fireEvent.keyDown(foodInput, { key: "Enter" });
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({
          favoriteFoods: ["Ikan kembung 🐟", "参巴 ikan 🐟"],
          favoriteToys: ["毛绒小鼠 🐭"],
        })
      )
    );
    expect(
      await screen.findByRole("button", { name: "Remove 参巴 ikan 🐟" })
    ).toBeTruthy();
  });

  it("sends explicit empty lists when both favourite fields are cleared", async () => {
    pet = {
      ...pet,
      favoriteFoods: ["Beef treats"],
      favoriteToys: ["Blue squeaky ball"],
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Beef treats" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Blue squeaky ball" })
    );
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ favoriteFoods: [], favoriteToys: [] })
      )
    );
  });
});
