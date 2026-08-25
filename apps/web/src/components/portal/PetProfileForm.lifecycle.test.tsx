// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

async function openSharingPrivacy() {
  fireEvent.click(
    await screen.findByRole("tab", { name: /Sharing & Privacy/ })
  );
}

async function openContactSafety() {
  fireEvent.click(
    await screen.findByRole("tab", { name: /Contact & Safety/ })
  );
}

async function openAppearance() {
  fireEvent.click(await screen.findByRole("tab", { name: /Appearance/ }));
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

  it("does not expose lifecycle controls or transition an Active pet on save", async () => {
    pet = {
      ...pet,
      memorial: {
        passedAwayDate: "01 Jan 2099",
        memorialMessage: "x".repeat(241),
        showMemorialOnPublicProfile: true,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    expect(screen.queryByText("Profile status & visibility")).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Active/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Memorial/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Archived/ })).toBeNull();

    clickSave();
    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();
    expect(mocks.updatePet.mock.calls[0][1]).not.toHaveProperty(
      "lifecycleStatus"
    );
    expect(mocks.updatePet.mock.calls[0][1]).not.toHaveProperty("memorial");
  });

  it("keeps the public tab id while presenting Sharing & Privacy", async () => {
    window.history.replaceState({}, "", `/pets/${pet.id}/edit?tab=public`);
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    const sharingTab = await screen.findByRole("tab", {
      name: /Sharing & Privacy/,
    });
    await waitFor(() => expect(sharingTab.getAttribute("aria-selected")).toBe("true"));
    expect(
      screen.getByRole("heading", { name: "Sharing & Privacy" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("tab", { name: "Public Profile" })
    ).toBeNull();
    expect(window.location.search).toBe("?tab=public");
  });

  it("keeps the functional Public Profile enabled control in Edit mode", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    const accessToggle = screen.getByRole("switch", {
      name: /Public Profile enabled/,
    });
    expect(accessToggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(accessToggle);
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ publicProfileEnabled: false }),
        { completeProfile: true }
      )
    );
  });

  it("places shared-profile and contact visibility controls under their owners", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    expect(screen.queryByText("Advanced")).toBeNull();
    expect(
      screen.getByRole("checkbox", {
        name: "Show birthday in Life Timeline",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("checkbox", {
        name: "Show care history on Public Profile",
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Visitors can see the type and date of care records you choose to share."
      )
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: "Show care badges" })
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: "Allow public health and care details",
      })
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Show owner name" })
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: "Show allergies on Public Profile",
      })
    ).toBeNull();

    await openContactSafety();
    expect(
      screen.getAllByRole("checkbox", { name: "Show owner name" })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("checkbox", {
        name: "Show allergies on Public Profile",
      })
    ).toHaveLength(1);
    expect(screen.getByText("Allergies")).toBeTruthy();
    expect(
      screen.getByText(/Public Profile or Safety Profile/)
    ).toBeTruthy();
    expect(
      screen.getByText(/general area on this pet's Public Profile and Safety Profile/)
    ).toBeTruthy();
  });

  it("writes the Care master through showCareBadges only", async () => {
    pet = {
      ...pet,
      visibility: {
        ...pet.visibility,
        showCareBadges: true,
        showHealthSummary: true,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Show care history on Public Profile",
      })
    );
    clickSave();

    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    const payload = mocks.updatePet.mock.calls[0][1] as PetPayload;
    expect(payload.visibility?.showCareBadges).toBe(false);
    expect(payload.visibility).not.toHaveProperty("showHealthSummary");
  });

  it("shows neutral contact-summary values instead of a fake location", async () => {
    pet = {
      ...pet,
      generalArea: "",
      owner: {
        ...pet.owner,
        name: "",
        phone: "",
        whatsapp: "",
      },
      contactOverride: {
        useOwnerDefaults: false,
        ownerDisplayName: "",
        generalArea: "",
        phoneNumber: "",
        whatsappNumber: "",
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openContactSafety();

    const contactCard = screen
      .getByRole("heading", { name: "Emergency Contact" })
      .closest(".scroll-mt-24");
    expect(contactCard).not.toBeNull();
    expect(within(contactCard as HTMLElement).getAllByText("Not provided")).toHaveLength(4);
    expect(contactCard?.textContent).not.toContain("Malaysia");
  });

  it("keeps Adoption Day and lifecycle controls out of Public Profile settings", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    expect(screen.queryByLabelText(/Adoption day/i)).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: "Show adoption day in Life Timeline",
      })
    ).toBeNull();

    expect(screen.queryByRole("radio", { name: /^Memorial/ })).toBeNull();
    expect(screen.queryByLabelText(/Date of passing, optional/)).toBeNull();
  });

  it("preserves a stored legacy Adoption Day when other pet details are saved", async () => {
    pet = {
      ...pet,
      visibility: { ...pet.visibility, showAdoptionDayOnTimeline: true },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    expect(screen.queryByLabelText(/Adoption day/i)).toBeNull();
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({
          adoptionDay: pet.adoptionDay,
          visibility: expect.objectContaining({
            showAdoptionDayOnTimeline: false,
          }),
        }),
        { completeProfile: true }
      )
    );
  });

  it("initializes the Appearance tab from the saved profile theme", async () => {
    pet = { ...pet, profileTheme: "lavender" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    fireEvent.click(await screen.findByRole("tab", { name: /Appearance/ }));

    expect(
      screen.getByRole("button", { name: /Lavender/ }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /Mint Green/ }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("uses compact labels for all four directly reachable mobile edit tabs", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    const tabList = await screen.findByRole("tablist", {
      name: "Edit pet sections",
    });
    const directTabs = within(tabList).getAllByRole("tab");

    expect(directTabs).toHaveLength(4);
    expect(directTabs.map((tab) => tab.textContent)).toEqual([
      "InfoBasic Info",
      "StyleAppearance",
      "SharingSharing & Privacy",
      "SafetyContact & Safety",
    ]);
    expect(tabList.parentElement?.parentElement?.className).toContain(
      "[&_button]:px-3"
    );
    expect(within(tabList).queryByRole("button", { name: "More" })).toBeNull();
  });

  it("maps legacy photos and theme links to the Appearance tab", async () => {
    for (const legacy of ["photos", "theme"]) {
      window.history.replaceState({}, "", `/pets/${pet.id}/edit?tab=${legacy}`);
      mocks.getPetById.mockResolvedValue({ data: pet });
      render(<PetProfileForm initialPet={pet} mode="edit" />);

      expect(
        await screen.findByRole("heading", { name: "Appearance" })
      ).toBeTruthy();
      expect(screen.getByText("Profile photo")).toBeTruthy();
      expect(
        screen.getByRole("heading", { name: "Profile Theme" })
      ).toBeTruthy();
      cleanup();
    }

    window.history.replaceState({}, "", `/pets/${pet.id}/edit`);
  });

  it("keeps a selected theme across tabs and reloads the saved value", async () => {
    pet = { ...pet, profileTheme: "lavender" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);

    fireEvent.click(await screen.findByRole("tab", { name: /Appearance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mint Green/ }));
    expect(
      screen.getByText(/Save changes to update .*public profile and Safety Profile/)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Basic Info/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));
    expect(
      screen.getByRole("button", { name: /Mint Green/ }).getAttribute("aria-pressed")
    ).toBe("true");

    clickSave();
    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ profileTheme: "mint" }),
        { completeProfile: true }
      )
    );

    cleanup();
    pet = { ...pet, profileTheme: "mint" };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    fireEvent.click(await screen.findByRole("tab", { name: /Appearance/ }));
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
    await openAppearance();
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
    await openAppearance();
    loadCoverPreviewGeometry({ naturalWidth: 1080, naturalHeight: 607 });

    fireEvent.change(
      screen.getByRole("slider", { name: "Vertical cover position" }),
      { target: { value: "83" } }
    );
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({ coverPositionX: 31, coverPositionY: 83 }),
        { completeProfile: true }
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
    await openAppearance();
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
    await openAppearance();
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
      screen.getByRole("button", { name: "Turn on Lost Mode" })
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

  it("keeps an Archived pet archived without a lifecycle request", async () => {
    pet = {
      ...pet,
      lifecycleStatus: "Archived",
      previousLifecycleStatus: "Memorial",
      memorial: {
        passedAwayDate: "01 Jan 2099",
        memorialMessage: "x".repeat(241),
        showMemorialOnPublicProfile: true,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    expect(screen.queryByText("Profile status & visibility")).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Active/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Memorial/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Archived/ })).toBeNull();
    expect(screen.queryByText("Memorial details")).toBeNull();

    clickSave();
    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(mocks.updatePet.mock.calls[0][1]).not.toHaveProperty(
      "lifecycleStatus"
    );
    expect(mocks.updatePet.mock.calls[0][1]).not.toHaveProperty("memorial");
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();
  });

  it("edits Memorial details without exposing a lifecycle selector", async () => {
    pet = {
      ...pet,
      lifecycleStatus: "Memorial",
      previousLifecycleStatus: "Memorial",
      memorial: {
        passedAwayDate: "01 Jan 2025",
        memorialMessage: "Always remembered.",
        showMemorialOnPublicProfile: true,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();

    expect(screen.getByText("Memorial details")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /^Active/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Memorial/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Archived/ })).toBeNull();

    const passedAwayDate = screen.getByLabelText(
      /Date of passing, optional/
    ) as HTMLInputElement;
    expect(passedAwayDate.classList.contains("brand-date-input")).toBe(true);
    fireEvent.change(passedAwayDate, { target: { value: "2025-09-15" } });
    fireEvent.change(screen.getByLabelText(/Memorial message, optional/), {
      target: { value: "Forever in our hearts." },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Show this memorial on the public profile",
      })
    );
    clickSave();

    await waitFor(() => expect(mocks.updatePetLifecycle).toHaveBeenCalledOnce());
    expect(mocks.updatePet).toHaveBeenCalledWith(
      pet.id,
      expect.not.objectContaining({
        lifecycleStatus: expect.anything(),
        memorial: expect.anything(),
      }),
      { completeProfile: true }
    );
    expect(mocks.updatePetLifecycle).toHaveBeenCalledWith(pet.id, "Memorial", {
      passedAwayDate: "15 Sept 2025",
      memorialMessage: "Forever in our hearts.",
      showMemorialOnPublicProfile: false,
    });
    expect(mocks.updatePet.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updatePetLifecycle.mock.invocationCallOrder[0]
    );
    expect(await screen.findByText("Changes saved.")).toBeTruthy();
    expect(screen.getByText("Memorial details")).toBeTruthy();
  });

  it("reports a Memorial-detail persistence failure after the profile save", async () => {
    pet = {
      ...pet,
      lifecycleStatus: "Memorial",
      previousLifecycleStatus: "Memorial",
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    mocks.updatePetLifecycle.mockRejectedValueOnce(
      new Error("Memorial details could not be saved")
    );
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();
    clickSave();

    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.updatePetLifecycle).toHaveBeenCalledOnce());
    expect(screen.queryByText("Changes saved.")).toBeNull();
    expect(
      screen.getByText("Something went wrong. Please try again.")
    ).toBeTruthy();
  });

  it("keeps Memorial validation on Sharing & Privacy for Memorial pets", async () => {
    pet = {
      ...pet,
      lifecycleStatus: "Memorial",
      previousLifecycleStatus: "Memorial",
      memorial: {
        ...pet.memorial,
        passedAwayDate: "01 Jan 2099",
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openSharingPrivacy();
    clickSave();

    expect(
      await screen.findByText("Passed away date cannot be in the future.")
    ).toBeTruthy();
    expect(mocks.updatePet).not.toHaveBeenCalled();
    expect(mocks.updatePetLifecycle).not.toHaveBeenCalled();
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

    const ageMode = screen.getByRole("combobox", {
      name: /Age information/,
    });
    expect(ageMode.textContent).toContain("Exact birthday");
    expect(screen.getByRole("combobox", { name: /^Breed/ }).textContent).toBe(
      "Other"
    );
    expect((screen.getByLabelText("Enter breed") as HTMLInputElement).value).toBe(
      "Domestic Longhair"
    );

    clickSave();
    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(mocks.updatePet).toHaveBeenCalledWith(
      pet.id,
      expect.objectContaining({ breed: "Domestic Longhair" }),
      { completeProfile: true }
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
        }),
        { completeProfile: true }
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
        }),
        { completeProfile: true }
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
        expect.objectContaining({ allergies: [] }),
        { completeProfile: true }
      )
    );
  });

  it("saves and reloads owner-name and allergy visibility from Contact & Safety", async () => {
    pet = {
      ...pet,
      allergies: ["Chicken"],
      visibility: {
        ...pet.visibility,
        showOwnerName: false,
        showAllergiesOnPublicProfile: false,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openContactSafety();

    const allergyVisibility = screen.getByRole("checkbox", {
      name: "Show allergies on Public Profile",
    }) as HTMLInputElement;
    const ownerVisibility = screen.getByRole("checkbox", {
      name: "Show owner name",
    }) as HTMLInputElement;
    expect(allergyVisibility.checked).toBe(false);
    expect(ownerVisibility.checked).toBe(false);
    expect(
      screen.getByText(
        /Allergies are always shown on the Safety Profile for pet safety/
      )
    ).toBeTruthy();

    fireEvent.click(allergyVisibility);
    fireEvent.click(ownerVisibility);
    clickSave();

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith(
        pet.id,
        expect.objectContaining({
          visibility: expect.objectContaining({
            showOwnerName: true,
            showAllergiesOnPublicProfile: true,
          }),
        }),
        { completeProfile: true }
      )
    );

    cleanup();
    pet = {
      ...pet,
      visibility: {
        ...pet.visibility,
        showOwnerName: true,
        showAllergiesOnPublicProfile: true,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openContactSafety();

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Show allergies on Public Profile",
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Show owner name",
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  it("routes owner-name validation to Contact & Safety", async () => {
    pet = {
      ...pet,
      contactOverride: {
        useOwnerDefaults: false,
        ownerDisplayName: "Milo's owner",
        generalArea: pet.generalArea,
        whatsappNumber: pet.owner.whatsapp,
        phoneNumber: pet.owner.phone,
      },
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openContactSafety();
    fireEvent.change(screen.getByRole("textbox", { name: "Owner display name" }), {
      target: { value: "x".repeat(81) },
    });
    fireEvent.click(screen.getByRole("tab", { name: /Basic Info/ }));
    clickSave();

    const contactTab = screen.getByRole("tab", { name: /Contact & Safety/ });
    await waitFor(() =>
      expect(contactTab.getAttribute("aria-selected")).toBe("true")
    );
    expect(screen.getByText("Keep this under 80 characters.")).toBeTruthy();
    expect(mocks.updatePet).not.toHaveBeenCalled();
  });

  it("shows one complete versioned share link only on the Public Profile tab", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await screen.findByRole("tab", { name: /Sharing & Privacy/ });

    expect(
      screen.queryByRole("textbox", { name: "Share profile link" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));
    expect(
      screen.queryByRole("textbox", { name: "Share profile link" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Contact & Safety/ }));
    expect(
      screen.queryByRole("textbox", { name: "Share profile link" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Sharing & Privacy/ }));
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
        expect.objectContaining({ favoriteFoods: [], favoriteToys: [] }),
        { completeProfile: true }
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
    expect(
      screen.getByText(/Add life events such as Adoption Day as a Moment/)
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Manage Care Records/ })).toBeTruthy();

    for (const tabName of [/Appearance/, /Sharing & Privacy/, /Contact & Safety/]) {
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
