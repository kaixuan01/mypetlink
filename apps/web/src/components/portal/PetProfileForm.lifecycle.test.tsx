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
  updatePetLostMode: vi.fn(),
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
    updatePetLostMode: (...args: unknown[]) =>
      mocks.updatePetLostMode(...args),
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

async function openPhotos() {
  fireEvent.click(await screen.findByRole("tab", { name: /Photos/ }));
}

function loadCoverPreviewGeometry({
  naturalWidth,
  naturalHeight,
  width = 500,
  height = 200,
}: {
  naturalWidth: number;
  naturalHeight: number;
  width?: number;
  height?: number;
}) {
  const image = screen.getByAltText(
    "Milo public profile cover preview"
  ) as HTMLImageElement;
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: naturalWidth },
    naturalHeight: { configurable: true, value: naturalHeight },
  });
  (image.parentElement as HTMLDivElement).getBoundingClientRect = () =>
    ({ width, height }) as DOMRect;
  fireEvent.load(image);
  return image;
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
    mocks.updatePetLostMode.mockImplementation(
      async (_id: string, enabled: boolean, lostMode: Pet["lostMode"]) => ({
        data: {
          ...pet,
          lostModeEnabled: enabled,
          lostMode: { ...pet.lostMode, ...lostMode },
        },
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

  it("loads and saves Adoption day through the shared date control", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPublicProfile();

    const adoptionDay = (await screen.findByLabelText(
      /Adoption day/
    )) as HTMLInputElement;
    expect(adoptionDay.value).toBe("2021-08-18");

    fireEvent.change(adoptionDay, { target: { value: "2026-01-19" } });
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ adoptionDay: "19 Jan 2026" })
      )
    );
  });

  it("initializes the Theme tab from the saved profile theme", async () => {
    pet = { ...pet, profileTheme: "lavender" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    fireEvent.click(await screen.findByRole("tab", { name: /Theme/ }));

    expect(
      screen.getByRole("button", { name: /Lavender/ }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /Mint Green/ }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("keeps a selected theme across tabs and reloads the saved value", async () => {
    pet = { ...pet, profileTheme: "lavender" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    fireEvent.click(await screen.findByRole("tab", { name: /Theme/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mint Green/ }));
    expect(
      screen.getByText(/Save changes to update .*public profile and Safety Profile/)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Photos/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Theme/ }));
    expect(
      screen.getByRole("button", { name: /Mint Green/ }).getAttribute("aria-pressed")
    ).toBe("true");

    clickSave();
    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ profileTheme: "mint" })
      )
    );

    cleanup();
    pet = { ...pet, profileTheme: "mint" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    fireEvent.click(await screen.findByRole("tab", { name: /Theme/ }));
    expect(
      screen.getByRole("button", { name: /Mint Green/ }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("uses one shared two-axis cover preview while keeping source photos neutral", async () => {
    pet = {
      ...pet,
      photoUrl: "/profile.jpg",
      coverUrl: "/cover.jpg",
      coverPositionX: 31,
      coverPositionY: 68,
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPhotos();
    const publicPreview = loadCoverPreviewGeometry({
      naturalWidth: 1600,
      naturalHeight: 400,
    });

    const horizontal = screen.getByRole("slider", {
      name: "Horizontal cover position",
    }) as HTMLInputElement;
    const vertical = screen.getByRole("slider", {
      name: "Vertical cover position",
    }) as HTMLInputElement;
    const coverSource = screen.getByAltText(
      "Cover photo preview"
    ) as HTMLImageElement;
    const profileSource = screen.getByAltText(
      "Profile photo preview"
    ) as HTMLImageElement;

    expect(horizontal.value).toBe("31");
    expect(vertical.value).toBe("68");
    expect(publicPreview.style.objectPosition).toBe("31% 68%");
    expect(coverSource.style.objectPosition).toBe("");
    expect(coverSource.classList.contains("object-contain")).toBe(true);
    expect(profileSource.style.objectPosition).toBe("");
    expect(horizontal.disabled).toBe(false);
    expect(vertical.disabled).toBe(true);
    expect(
      screen.getByText(
        "This photo already fits vertically in the cover area."
      )
    ).toBeTruthy();

    fireEvent.change(horizontal, { target: { value: "0" } });
    expect(vertical.value).toBe("68");
    expect(publicPreview.style.objectPosition).toBe("0% 68%");

    loadCoverPreviewGeometry({ naturalWidth: 1080, naturalHeight: 607 });
    expect(horizontal.disabled).toBe(true);
    expect(vertical.disabled).toBe(false);
    expect(
      screen.getByText(
        "This photo already fits horizontally in the cover area."
      )
    ).toBeTruthy();

    fireEvent.change(vertical, { target: { value: "100" } });
    expect(horizontal.value).toBe("0");
    expect(publicPreview.style.objectPosition).toBe("0% 100%");
    expect(
      screen.getByText("Save changes to keep this cover position.")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset to Centre" }));
    expect(horizontal.value).toBe("50");
    expect(vertical.value).toBe("50");
    expect(publicPreview.style.objectPosition).toBe("50% 50%");
  });

  it("saves both cover axes and restores their saved values after reload", async () => {
    pet = {
      ...pet,
      coverUrl: "/cover.jpg",
      coverPositionX: 31,
      coverPositionY: 68,
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPhotos();
    loadCoverPreviewGeometry({ naturalWidth: 1080, naturalHeight: 607 });

    fireEvent.change(
      screen.getByRole("slider", { name: "Vertical cover position" }),
      { target: { value: "83" } }
    );
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ coverPositionX: 31, coverPositionY: 83 })
      )
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("slider", {
        name: "Vertical cover position",
      }) as HTMLInputElement).value
    ).toBe("83");

    cleanup();
    pet = { ...pet, coverPositionX: 31, coverPositionY: 83 };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPhotos();
    expect(
      (screen.getByRole("slider", {
        name: "Horizontal cover position",
      }) as HTMLInputElement).value
    ).toBe("31");
    expect(
      (screen.getByRole("slider", {
        name: "Vertical cover position",
      }) as HTMLInputElement).value
    ).toBe("83");
  });

  it("keeps unsaved cover-position feedback after a failed save", async () => {
    pet = {
      ...pet,
      coverUrl: "/cover.jpg",
      coverPositionX: 31,
      coverPositionY: 68,
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    mocks.updatePet.mockRejectedValueOnce(new Error("Connection failed"));
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPhotos();
    loadCoverPreviewGeometry({ naturalWidth: 1080, naturalHeight: 607 });

    const vertical = screen.getByRole("slider", {
      name: "Vertical cover position",
    }) as HTMLInputElement;
    fireEvent.change(vertical, { target: { value: "12" } });
    clickSave();

    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(vertical.value).toBe("12");
    expect(
      screen.getByText("Save changes to keep this cover position.")
    ).toBeTruthy();
    expect(screen.queryByText(/Changes saved/)).toBeNull();
  });

  it("manages Lost Mode directly from Contact & Safety", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    fireEvent.click(
      await screen.findByRole("tab", { name: /Contact & Safety/ })
    );

    expect(screen.queryByText("Manage Lost Mode")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: `Mark ${pet.name} as Lost` })
    );
    expect(screen.getByText(`Mark ${pet.name} as lost?`)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Activate Lost Mode" })
    );

    await waitFor(() =>
      expect(mocks.updatePetLostMode).toHaveBeenCalledWith(
        pet.id,
        true,
        expect.objectContaining({ lostMessage: expect.any(String) })
      )
    );
    expect(await screen.findByText("On")).toBeTruthy();

    const foundAction = screen.getByRole("button", {
      name: `Mark ${pet.name} as Found`,
    }) as HTMLButtonElement;
    expect(foundAction.type).toBe("button");
    fireEvent.click(foundAction);
    fireEvent.click(screen.getByRole("button", { name: "Mark as Found" }));

    await waitFor(() =>
      expect(mocks.updatePetLostMode).toHaveBeenLastCalledWith(
        pet.id,
        false,
        expect.objectContaining(pet.lostMode)
      )
    );
    expect(await screen.findByText("Off")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Lost Mode is off"
    );
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

  it("initializes, normalizes, saves, and clears known allergies", async () => {
    pet = { ...pet, allergies: ["Chicken", "Penicillin 💊"] };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    fireEvent.click(await screen.findByRole("tab", { name: /Contact & Safety/ }));
    expect(screen.getByRole("button", { name: "Remove Chicken" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove Penicillin 💊" })
    ).toBeTruthy();

    const input = screen.getByLabelText("Allergies: add your own");
    fireEvent.change(input, { target: { value: "  花粉  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "chicken" } });
    fireEvent.keyDown(input, { key: "Enter" });
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({
          allergies: ["Chicken", "Penicillin 💊", "花粉"],
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Chicken" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Penicillin 💊" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove 花粉" }));
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenLastCalledWith(
        pet.id,
        expect.objectContaining({ allergies: [] })
      )
    );
  });

  it("saves and reloads the explicit Public Profile allergy visibility", async () => {
    pet = {
      ...pet,
      allergies: ["Chicken"],
      visibility: {
        ...pet.visibility,
        showAllergiesOnPublicProfile: false,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPublicProfile();

    const visibility = screen.getByRole("checkbox", {
      name: "Show allergies on Public Profile",
    }) as HTMLInputElement;
    expect(visibility.checked).toBe(false);
    expect(
      screen.getByText(
        /Allergies are always shown on the Safety Profile for pet safety/
      )
    ).toBeTruthy();

    fireEvent.click(visibility);
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({
          visibility: expect.objectContaining({
            showAllergiesOnPublicProfile: true,
          }),
        })
      )
    );

    cleanup();
    pet = {
      ...pet,
      visibility: {
        ...pet.visibility,
        showAllergiesOnPublicProfile: true,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openPublicProfile();

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Show allergies on Public Profile",
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  it("shows one complete versioned share link only on the Public Profile tab", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await screen.findByRole("tab", { name: /Public Profile/ });

    expect(
      screen.queryByRole("textbox", { name: "Share profile link" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Photos/ }));
    expect(
      screen.queryByRole("textbox", { name: "Share profile link" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Theme/ }));
    expect(
      screen.queryByRole("textbox", { name: "Share profile link" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Contact & Safety/ }));
    expect(
      screen.queryByRole("textbox", { name: "Share profile link" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Public Profile/ }));
    const displayedUrls = screen.getAllByRole("textbox", {
      name: "Share profile link",
    });

    expect(displayedUrls).toHaveLength(1);
    expect(displayedUrls[0].textContent).toMatch(
      /^http:\/\/localhost(?::\d+)?\/p\/[^?]+\?share=[a-z0-9]+$/
    );
    expect(screen.getAllByRole("button", { name: "Copy Link" })).toHaveLength(
      1
    );
    expect(screen.queryByText("Public Profile URL")).toBeNull();
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

  it("keeps the tag pickers in About your pet without a Preferences heading", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    await screen.findByText("About your pet");
    expect(screen.queryByText("Preferences")).toBeNull();
    expect(
      screen.queryByText("Optional details that make the profile feel personal.")
    ).toBeNull();
    for (const label of ["Personality tags", "Favourite foods", "Favourite toys"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("shows the manage-content shortcuts on the Info tab only", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    expect(
      await screen.findByText(`Manage ${pet.name}'s content`)
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Manage Care Records/ })).toBeTruthy();

    for (const tabName of [/Photos/, /Theme/, /Public Profile/, /Contact & Safety/]) {
      fireEvent.click(screen.getByRole("tab", { name: tabName }));
      expect(screen.queryByText(`Manage ${pet.name}'s content`)).toBeNull();
      expect(
        screen.queryByRole("link", { name: /Manage Care Records/ })
      ).toBeNull();
    }

    // Returning to Info brings the single instance back.
    fireEvent.click(screen.getByRole("tab", { name: /Basic Info/ }));
    expect(screen.getByText(`Manage ${pet.name}'s content`)).toBeTruthy();
  });
});
