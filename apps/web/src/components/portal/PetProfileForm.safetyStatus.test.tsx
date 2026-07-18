// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { defaultOwnerSettings } from "@/lib/ownerSettings";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn() },
  getPetById: vi.fn(),
  updatePet: vi.fn(),
  updatePetLifecycle: vi.fn(),
  updatePetLostMode: vi.fn(),
}));

vi.mock("@/lib/features", () => ({
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: true,
  smartTagOrderingEnabled: false,
  smartTagsEnabled: false,
  tagOrdersEnabled: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => false,
  isApiConfigured: () => false,
}));

vi.mock("@/services/authService", () => ({
  logoutOwner: vi.fn(),
}));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    updatePet: (...args: unknown[]) => mocks.updatePet(...args),
    updatePetLifecycle: (...args: unknown[]) => mocks.updatePetLifecycle(...args),
    updatePetLostMode: (...args: unknown[]) => mocks.updatePetLostMode(...args),
  };
});

const { PetProfileForm } = await import("./PetProfileForm");

function writeOwnerContact(phoneNumber: string, whatsappNumber: string) {
  window.localStorage.setItem(
    "mypetlink_owner_settings",
    JSON.stringify({
      ...defaultOwnerSettings,
      phoneNumber,
      whatsappNumber,
    })
  );
}

function petWithOwnContact(overrides: Partial<Pet> = {}): Pet {
  const base = structuredClone(mockPets[0]);
  return {
    ...base,
    lifecycleStatus: "Active",
    previousLifecycleStatus: "Active",
    owner: { ...base.owner, phone: "", whatsapp: "" },
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: "",
      whatsappNumber: "",
    },
    ...overrides,
  };
}

async function openContactTab() {
  fireEvent.click(await screen.findByRole("tab", { name: /Contact & Safety/ }));
}

describe("Safety Profile contact warning", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/pets/pet_milo/edit");
    mocks.getPetById.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the warning panel and links Update Contact to owner settings for owner-default pets", async () => {
    writeOwnerContact("", "");
    const pet = structuredClone(mockPets[0]);
    pet.contactOverride = { useOwnerDefaults: true };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm mode="edit" initialPet={pet} />);
    await openContactTab();

    expect(screen.getAllByText("Contact Update Needed").length).toBeGreaterThan(0);
    expect(
      await screen.findByRole("heading", { name: "Update your contact details" })
    ).toBeTruthy();
    const action = screen.getByRole("link", { name: /Update Contact/ });
    expect(action.getAttribute("href")).toBe("/settings#owner-contact");
  });

  it("focuses the pet-specific contact section for pets with their own contact", async () => {
    writeOwnerContact("+60123456789", "+60123456789");
    const pet = petWithOwnContact();
    mocks.getPetById.mockResolvedValue({ data: pet });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<PetProfileForm mode="edit" initialPet={pet} />);
    await openContactTab();

    // The owner's account numbers must not mask the pet's empty contact.
    const action = await screen.findByRole("button", { name: /Update Contact/ });
    fireEvent.click(action);

    expect(scrollIntoView).toHaveBeenCalled();
    expect(
      (document.activeElement as HTMLElement | null)?.closest("div")
    ).toBeTruthy();
  });

  it("shows no warning when a visible valid contact exists", async () => {
    writeOwnerContact("", "+60123456789");
    const pet = structuredClone(mockPets[0]);
    pet.contactOverride = { useOwnerDefaults: true };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm mode="edit" initialPet={pet} />);
    await openContactTab();

    expect(await screen.findAllByText("Safety Profile Active")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Update your contact details" })
    ).toBeNull();
  });

  it("opens the Contact & Safety tab directly from a ?tab=contact deep link", async () => {
    writeOwnerContact("", "");
    window.history.replaceState({}, "", "/pets/pet_milo/edit?tab=contact");
    const pet = structuredClone(mockPets[0]);
    pet.contactOverride = { useOwnerDefaults: true };
    mocks.getPetById.mockResolvedValue({ data: pet });
    render(<PetProfileForm mode="edit" initialPet={pet} />);

    expect(
      await screen.findByRole("heading", { name: "Update your contact details" })
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: /Safety Profile enabled/ })
    ).toBeTruthy();
  });
});
