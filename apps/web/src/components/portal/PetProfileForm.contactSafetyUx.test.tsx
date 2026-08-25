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
import {
  defaultOwnerSettings,
  writeOwnerSettings,
} from "@/lib/ownerSettings";
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

async function openTab(name: RegExp) {
  fireEvent.click(await screen.findByRole("tab", { name }));
  await screen.findByRole("heading", {
    name: name.source.includes("Sharing")
      ? "Sharing & Privacy"
      : "Contact & Safety",
  });
}

function clickSave() {
  fireEvent.click(screen.getAllByRole("button", { name: "Save Changes" })[0]);
}

describe("PetProfileForm Sharing and Contact mobile UX", () => {
  let pet: Pet;

  beforeEach(() => {
    window.localStorage.clear();
    writeOwnerSettings({
      ...defaultOwnerSettings,
      ownerDisplayName: "Account owner",
      whatsappNumber: "+60111111111",
      phoneNumber: "+60222222222",
      defaultGeneralArea: "Account area",
    });
    pet = activePet();
    window.history.replaceState({}, "", `/pets/${pet.id}/edit`);
    mocks.getPetById.mockResolvedValue({ data: pet });
    mocks.updatePet.mockImplementation(
      async (_id: string, payload: PetPayload) => ({
        data: { ...pet, ...payload },
      })
    );
    mocks.updatePetLifecycle.mockResolvedValue({ data: pet });
    mocks.updatePetLostMode.mockResolvedValue({ data: pet });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("keeps Sharing controls as one switch and the existing checkboxes", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openTab(/Sharing & Privacy/);

    const publicProfile = screen.getByRole("switch", {
      name: "Public Profile enabled",
    });
    const checkboxNames = [
      "Show care history on Public Profile",
      "Show public memories",
      "Show Life Timeline",
      "Show birthday in Life Timeline",
    ];

    fireEvent.click(publicProfile);
    for (const name of checkboxNames) {
      const checkbox = screen.getByRole("checkbox", { name });
      expect(checkbox.closest("[data-setting-row]")).not.toBeNull();
      fireEvent.click(checkbox);
    }
    clickSave();

    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    const payload = mocks.updatePet.mock.calls[0][1] as PetPayload;
    expect(payload.publicProfileEnabled).toBe(false);
    expect(payload.visibility).toEqual(
      expect.objectContaining({
        showCareBadges: false,
        showMoments: false,
        showTimeline: false,
        showBirthdayOnTimeline: false,
      })
    );
  });

  it("exposes one contact-source radiogroup with exactly one selected radio", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openTab(/Contact & Safety/);

    const group = screen.getByRole("radiogroup", { name: "Contact source" });
    const ownerDefaults = within(group).getByRole("radio", {
      name: /^Use account contact details/,
    }) as HTMLInputElement;
    const petSpecific = within(group).getByRole("radio", {
      name: /^Use different contact details for this pet/,
    }) as HTMLInputElement;

    expect(ownerDefaults.checked).toBe(true);
    expect(petSpecific.checked).toBe(false);
    expect(ownerDefaults.closest("label")?.className).toContain("min-h-14");
    fireEvent.keyDown(ownerDefaults, { key: "ArrowRight" });
    expect(ownerDefaults.checked).toBe(false);
    expect(petSpecific.checked).toBe(true);
  });

  it("preserves the existing owner-default copy behavior across repeated switching", async () => {
    pet.contactOverride = {
      useOwnerDefaults: false,
      ownerDisplayName: "Pet contact",
      whatsappNumber: "+60333333333",
      phoneNumber: "+60444444444",
      generalArea: "Pet area",
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openTab(/Contact & Safety/);

    const ownerDefaults = screen.getByRole("radio", {
      name: /^Use account contact details/,
    });
    const petSpecific = screen.getByRole("radio", {
      name: /^Use different contact details for this pet/,
    });

    expect(screen.getByRole("textbox", { name: "Owner display name" })).toHaveProperty(
      "value",
      "Pet contact"
    );
    fireEvent.click(ownerDefaults);
    expect(screen.queryByRole("textbox", { name: "Owner display name" })).toBeNull();
    expect(screen.getByText("Account owner")).toBeTruthy();

    fireEvent.click(petSpecific);
    expect(screen.getByRole("textbox", { name: "Owner display name" })).toHaveProperty(
      "value",
      "Account owner"
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Owner display name" }), {
      target: { value: "Edited pet contact" },
    });
    fireEvent.click(ownerDefaults);
    fireEvent.click(petSpecific);

    expect(screen.getByRole("textbox", { name: "Owner display name" })).toHaveProperty(
      "value",
      "Account owner"
    );
    clickSave();
    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(mocks.updatePet.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        contactOverride: expect.objectContaining({
          useOwnerDefaults: false,
          ownerDisplayName: "Account owner",
          whatsappNumber: "+60111111111",
          phoneNumber: "+60222222222",
          generalArea: "Account area",
        }),
      })
    );
  });

  it.each([
    [true, "Account owner"],
    [false, "Stored pet contact"],
  ])(
    "loads an existing useOwnerDefaults=%s pet without mutating it",
    async (useOwnerDefaults, expectedName) => {
      pet.contactOverride = useOwnerDefaults
        ? { useOwnerDefaults: true }
        : {
            useOwnerDefaults: false,
            ownerDisplayName: "Stored pet contact",
            whatsappNumber: "+60555555555",
            phoneNumber: "+60666666666",
            generalArea: "Stored pet area",
          };
      mocks.getPetById.mockResolvedValue({ data: pet });
      render(<PetProfileForm initialPet={pet} mode="edit" />);
      await openTab(/Contact & Safety/);

      expect(screen.getByText(expectedName)).toBeTruthy();
      expect(mocks.updatePet).not.toHaveBeenCalled();
      expect(pet.contactOverride?.useOwnerDefaults).toBe(useOwnerDefaults);
    }
  );

  it("keeps finder booleans mapped to their existing switch and checkbox fields", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openTab(/Contact & Safety/);

    for (const name of ["WhatsApp", "Phone call", "General area", "Emergency note"]) {
      fireEvent.click(screen.getByRole("switch", { name }));
    }
    for (const name of ["Show owner name", "Show allergies on Public Profile"]) {
      fireEvent.click(screen.getByRole("checkbox", { name }));
    }
    clickSave();

    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(mocks.updatePet.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        visibility: expect.objectContaining({
          showWhatsapp: false,
          showPhone: false,
          showGeneralArea: false,
          showEmergencyNote: false,
          showOwnerName: false,
          showAllergiesOnPublicProfile: true,
        }),
      })
    );
  });

  it("auto-grows notes while preserving labels, limits, values, and payload fields", async () => {
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openTab(/Contact & Safety/);

    const safety = screen.getByRole("textbox", {
      name: "Safety note / handling instructions",
    }) as HTMLTextAreaElement;
    const emergency = screen.getByRole("textbox", {
      name: "Emergency note",
    }) as HTMLTextAreaElement;
    Object.defineProperty(safety, "scrollHeight", { configurable: true, value: 310 });
    fireEvent.input(safety);

    expect(safety.maxLength).toBe(260);
    expect(emergency.maxLength).toBe(260);
    expect(safety.style.height).toBe("240px");
    expect(safety.style.overflowY).toBe("auto");
    expect(safety.getAttribute("aria-describedby")).toContain("pet-safety-note-helper");

    fireEvent.change(safety, { target: { value: "  Keep calm and call first.  " } });
    fireEvent.change(emergency, { target: { value: "  Keep shaded.  " } });
    clickSave();

    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(mocks.updatePet.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        safetyNote: "Keep calm and call first.",
        emergencyNote: "Keep shaded.",
      })
    );
  });

  it("wraps and removes an 80-character allergy without changing serialization", async () => {
    const longAllergy = "allergy-" + "x".repeat(72);
    pet.allergies = [longAllergy];
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm initialPet={pet} mode="edit" />);
    await openTab(/Contact & Safety/);

    const remove = screen.getByRole("button", { name: `Remove ${longAllergy}` });
    expect(remove.className).toContain("max-w-full");
    expect(remove.className).toContain("min-h-11");
    expect(remove.querySelector("span")?.className).toContain("overflow-wrap:anywhere");
    fireEvent.click(remove);
    clickSave();

    await waitFor(() => expect(mocks.updatePet).toHaveBeenCalledOnce());
    expect(mocks.updatePet.mock.calls[0][1]).toEqual(
      expect.objectContaining({ allergies: [] })
    );
  });
});
