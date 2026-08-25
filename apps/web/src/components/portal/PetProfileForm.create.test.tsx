// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { AnalyticsEvent } from "@/lib/analytics";

const mocks = vi.hoisted(() => ({
  apiEnabled: false,
  createPet: vi.fn(),
  readImageAsDataUrl: vi.fn(),
  replace: vi.fn(),
  trackEvent: vi.fn(),
  uploadMediaFile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: mocks.replace }),
}));
vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => mocks.apiEnabled,
  isApiConfigured: () => false,
}));
vi.mock("@/lib/imageUpload", () => ({
  readImageAsDataUrl: (...args: unknown[]) => mocks.readImageAsDataUrl(...args),
}));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, trackEvent: mocks.trackEvent };
});
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return { ...actual, createPet: mocks.createPet };
});
vi.mock("@/services/mediaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/mediaService")>();
  return { ...actual, uploadMediaFile: mocks.uploadMediaFile };
});

const { PetProfileForm } = await import("./PetProfileForm");

const createdPet = {
  ...structuredClone(mockPets[0]),
  id: "new-pet-id",
  name: "Milo",
  publicProfilePath: "/p/milo-public",
  publicProfileEnabled: true,
};

function enterNameAndSave() {
  fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
    target: { value: "Milo" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Save Pet" })[0]);
}

function chooseCustomSelectOption(controlName: RegExp | string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: controlName }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

beforeEach(() => {
  mocks.apiEnabled = false;
  window.history.replaceState({}, "", "/pets/new");
  window.localStorage.clear();
  mocks.createPet.mockResolvedValue({ data: createdPet });
  mocks.readImageAsDataUrl.mockResolvedValue("data:image/png;base64,photo");
  mocks.uploadMediaFile.mockReset();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PetProfileForm creation activation", () => {
  it("shows the focused activation hierarchy and preserves PII-free pet_created", async () => {
    render(<PetProfileForm mode="create" />);

    enterNameAndSave();

    expect(
      await screen.findByRole("heading", { name: "Milo is on MyPetLink" })
    ).toBe(document.activeElement);
    expect(screen.getByRole("link", { name: "Go to Milo's page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View public profile" })).toBeTruthy();
    expect(screen.queryByText(/First Moment/)).toBeNull();
    expect(screen.queryByText(/photo couldn't be uploaded/)).toBeNull();
    expect(mocks.trackEvent).toHaveBeenCalledWith(AnalyticsEvent.PetCreated, {
      source: "owner_portal",
    });
    expect(JSON.stringify(mocks.trackEvent.mock.calls)).not.toContain("Milo");
    expect(JSON.stringify(mocks.trackEvent.mock.calls)).not.toContain("new-pet-id");
  });

  it("does not show success or emit pet_created when creation fails", async () => {
    mocks.createPet.mockRejectedValue(new Error("Creation failed"));
    render(<PetProfileForm mode="create" />);

    enterNameAndSave();

    await waitFor(() => expect(mocks.createPet).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/is on MyPetLink/i)).toBeNull();
    expect(
      mocks.trackEvent.mock.calls.some(([event]) => event === AnalyticsEvent.PetCreated)
    ).toBe(false);
  });

  it("does not turn untouched optional fields into saved pet content", async () => {
    render(<PetProfileForm mode="create" />);

    enterNameAndSave();

    await waitFor(() => expect(mocks.createPet).toHaveBeenCalledTimes(1));
    expect(mocks.createPet).toHaveBeenCalledWith(
      expect.objectContaining({
        breed: "",
        gender: "",
        color: "",
        bio: "",
        generalArea: "",
        safetyNote: "",
        emergencyNote: "",
        ageInformationMode: "Unknown",
        photoUrl: "",
      })
    );
    const payload = mocks.createPet.mock.calls[0][0];
    expect(payload).not.toHaveProperty("visibility");
    expect(payload).not.toHaveProperty("publicProfileEnabled");
    expect(payload).not.toHaveProperty("qrSafetyEnabled");
  });

  it("keeps the created pet available when optional photo upload needs another try", async () => {
    mocks.uploadMediaFile.mockRejectedValue(new Error("Connection interrupted."));
    render(<PetProfileForm mode="create" />);

    const photoInput = document.querySelector<HTMLInputElement>(
      'input[type="file"]'
    );
    expect(photoInput).toBeTruthy();
    fireEvent.change(photoInput!, {
      target: {
        files: [new File(["photo"], "milo.png", { type: "image/png" })],
      },
    });
    await screen.findByAltText("Add a photo preview");
    mocks.apiEnabled = true;

    enterNameAndSave();

    expect(
      await screen.findByRole("heading", { name: "Milo is on MyPetLink" })
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Milo was created, but the photo couldn't be uploaded. You can add it again from Edit Pet."
    );
    expect(
      screen.getByRole("link", { name: "Go to Milo's page" }).getAttribute("href")
    ).toBe(`/pets/${createdPet.id}`);
    expect(mocks.createPet).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaFile).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "PetProfilePhoto",
        petId: createdPet.id,
      })
    );
    expect(mocks.createPet.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.uploadMediaFile.mock.invocationCallOrder[0]
    );
  });

  it("shows success without a warning when the optional photo uploads", async () => {
    mocks.uploadMediaFile.mockResolvedValue({
      mediaId: "uploaded-photo",
      publicUrl: "https://cdn.example.test/media/milo.png",
    });
    render(<PetProfileForm mode="create" />);

    const photoInput = document.querySelector<HTMLInputElement>(
      'input[type="file"]'
    );
    fireEvent.change(photoInput!, {
      target: {
        files: [new File(["photo"], "milo.png", { type: "image/png" })],
      },
    });
    await screen.findByAltText("Add a photo preview");
    mocks.apiEnabled = true;

    enterNameAndSave();

    expect(
      await screen.findByRole("heading", { name: "Milo is on MyPetLink" })
    ).toBeTruthy();
    expect(screen.queryByText(/photo couldn't be uploaded/)).toBeNull();
    expect(screen.getByAltText("Pet portrait").getAttribute("src")).toBe(
      "https://cdn.example.test/media/milo.png"
    );
    expect(mocks.createPet).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaFile).toHaveBeenCalledOnce();
  });

  it("renders the final single-screen Create controls without tabs", () => {
    render(<PetProfileForm mode="create" />);

    expect(screen.getByText("Add a photo")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: /Pet name/ })
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Pet type" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^Breed/ })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: /Age information/ }).textContent
    ).toContain("Unknown");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("removes deferred profile, appearance, contact, and safety controls from Create", () => {
    render(<PetProfileForm mode="create" />);

    for (const text of [
      "Short bio / description",
      "Personality tags",
      "Cover photo",
      "Profile Theme",
      "Customize link",
      "Allergies",
      "Safety note / handling instructions",
      "Emergency note",
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.queryByRole("radiogroup", { name: "Gender" })).toBeNull();
    expect(screen.queryByLabelText("Color")).toBeNull();
    expect(
      screen.queryByRole("tab", { name: /Sharing & Privacy/ })
    ).toBeNull();
    expect(
      screen.queryByRole("tab", { name: /Contact & Safety/ })
    ).toBeNull();
  });

  it("focuses the missing name instead of routing to a tab", () => {
    render(<PetProfileForm mode="create" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Save Pet" })[0]);

    const name = screen.getByRole("textbox", { name: /Pet name/ });
    expect(screen.getByText("Pet name is required.")).toBeTruthy();
    expect(name).toBe(document.activeElement);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
    expect(mocks.createPet).not.toHaveBeenCalled();
  });

  it("exposes application-required fields without native required validation", () => {
    render(<PetProfileForm mode="create" />);

    const name = screen.getByRole("textbox", { name: /Pet name/ });
    const petType = screen.getByRole("combobox", { name: "Pet type" });
    const form = name.closest("form")!;

    expect(name.getAttribute("aria-required")).toBe("true");
    expect(petType.getAttribute("aria-required")).toBe("true");
    expect(name.hasAttribute("required")).toBe(false);
    expect(petType.hasAttribute("required")).toBe(false);
    expect(form.checkValidity()).toBe(true);
  });

  it("validates and focuses the conditional custom pet type before saving", async () => {
    render(<PetProfileForm mode="create" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
      target: { value: "Nori" },
    });
    chooseCustomSelectOption("Pet type", "Other");

    const customType = screen.getByRole("textbox", { name: /Enter pet type/ });
    fireEvent.click(screen.getAllByRole("button", { name: "Save Pet" })[0]);

    expect(screen.getByText("Enter your pet type.")).toBeTruthy();
    expect(customType).toBe(document.activeElement);
    expect(mocks.createPet).not.toHaveBeenCalled();

    fireEvent.change(customType, { target: { value: "Axolotl" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save Pet" })[0]);

    await waitFor(() => expect(mocks.createPet).toHaveBeenCalledOnce());
    expect(mocks.createPet).toHaveBeenCalledWith(
      expect.objectContaining({
        species: "Other",
        customSpecies: "Axolotl",
      })
    );
  });

  it("keeps the custom pet type hidden for a normal species", () => {
    render(<PetProfileForm mode="create" />);

    expect(
      screen.getByRole("combobox", { name: "Pet type" }).textContent
    ).toContain("Dog");
    expect(screen.queryByRole("textbox", { name: /Enter pet type/ })).toBeNull();
  });

  it("shows Other and preserves the 60-character custom pet type limit", async () => {
    render(<PetProfileForm mode="create" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
      target: { value: "Nori" },
    });
    chooseCustomSelectOption("Pet type", "Other");

    const customType = screen.getByRole("textbox", {
      name: /Enter pet type/,
    }) as HTMLInputElement;
    const sixtyCharacterType = "x".repeat(60);
    expect(customType.maxLength).toBe(60);
    fireEvent.change(customType, { target: { value: sixtyCharacterType } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save Pet" })[0]);

    await waitFor(() => expect(mocks.createPet).toHaveBeenCalledOnce());
    expect(mocks.createPet).toHaveBeenCalledWith(
      expect.objectContaining({ customSpecies: sixtyCharacterType })
    );
  });

  it("rejects a custom pet type beyond 60 characters", () => {
    render(<PetProfileForm mode="create" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
      target: { value: "Nori" },
    });
    chooseCustomSelectOption("Pet type", "Other");

    const customType = screen.getByRole("textbox", { name: /Enter pet type/ });
    fireEvent.change(customType, { target: { value: "x".repeat(61) } });
    fireEvent.submit(customType.closest("form")!);

    expect(screen.getByText("Keep this under 60 characters.")).toBeTruthy();
    expect(customType).toBe(document.activeElement);
    expect(mocks.createPet).not.toHaveBeenCalled();
  });

  it("focuses a future exact birthday after showing its validation message", () => {
    render(<PetProfileForm mode="create" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
      target: { value: "Milo" },
    });
    chooseCustomSelectOption(/Age information/, "Exact birthday");
    const birthday = screen.getByLabelText(/Exact birthday/);
    const futureYear = new Date().getFullYear() + 1;
    fireEvent.change(birthday, { target: { value: `${futureYear}-01-01` } });

    fireEvent.submit(birthday.closest("form")!);

    expect(screen.getByText("Birthday cannot be in the future.")).toBeTruthy();
    expect(birthday).toBe(document.activeElement);
    expect(mocks.createPet).not.toHaveBeenCalled();
  });

  it("focuses an out-of-range estimated year after showing its validation message", () => {
    render(<PetProfileForm mode="create" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
      target: { value: "Milo" },
    });
    chooseCustomSelectOption(/Age information/, "Estimated birth year");
    const estimatedYear = screen.getByLabelText(
      /Estimated birth year/
    ) as HTMLSelectElement;
    estimatedYear.add(new Option("1899", "1899"));
    fireEvent.change(estimatedYear, { target: { value: "1899" } });

    fireEvent.click(screen.getAllByRole("button", { name: "Save Pet" })[0]);

    expect(
      screen.getByText(
        `Choose a year from 1900 to ${new Date().getUTCFullYear()}.`
      )
    ).toBeTruthy();
    expect(estimatedYear).toBe(document.activeElement);
    expect(mocks.createPet).not.toHaveBeenCalled();
  });

  it.each([
    ["ExactBirthday", "Exact birthday", "", "Choose your pet's birthday."],
    ["EstimatedBirthYear", "Estimated birth year", "", "Choose an estimated birth year."],
  ])(
    "focuses the invalid %s control",
    (ageMode, label, value, error) => {
      render(<PetProfileForm mode="create" />);
      fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
        target: { value: "Milo" },
      });
      chooseCustomSelectOption(
        /Age information/,
        ageMode === "ExactBirthday" ? "Exact birthday" : "Estimated birth year"
      );
      const control = screen.getByLabelText(new RegExp(label));
      if (value) {
        fireEvent.change(control, { target: { value } });
      }

      fireEvent.click(screen.getAllByRole("button", { name: "Save Pet" })[0]);

      expect(screen.getByText(error)).toBeTruthy();
      expect(control).toBe(document.activeElement);
      expect(mocks.createPet).not.toHaveBeenCalled();
    }
  );

  it("prevents duplicate creation while the first submission is pending", async () => {
    let resolveCreation: ((value: { data: typeof createdPet }) => void) | undefined;
    mocks.createPet.mockReturnValue(
      new Promise((resolve) => {
        resolveCreation = resolve;
      })
    );
    render(<PetProfileForm mode="create" />);

    fireEvent.change(screen.getByRole("textbox", { name: /Pet name/ }), {
      target: { value: "Milo" },
    });
    const save = screen.getAllByRole("button", { name: "Save Pet" })[0];
    fireEvent.click(save);
    fireEvent.click(save);

    expect(mocks.createPet).toHaveBeenCalledTimes(1);
    resolveCreation?.({ data: createdPet });
    expect(
      await screen.findByRole("heading", { name: "Milo is on MyPetLink" })
    ).toBeTruthy();
  });
});
