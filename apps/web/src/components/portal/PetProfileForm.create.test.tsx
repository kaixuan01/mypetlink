// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { AnalyticsEvent } from "@/lib/analytics";

const mocks = vi.hoisted(() => ({
  createPet: vi.fn(),
  replace: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: mocks.replace }),
}));
vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => false,
  isApiConfigured: () => false,
}));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, trackEvent: mocks.trackEvent };
});
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return { ...actual, createPet: mocks.createPet };
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

beforeEach(() => {
  window.history.replaceState({}, "", "/pets/new");
  window.localStorage.clear();
  mocks.createPet.mockResolvedValue({ data: createdPet });
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
      await screen.findByRole("heading", { name: "Milo's profile is ready!" })
    ).toBe(document.activeElement);
    expect(screen.getByRole("link", { name: "View Milo's Profile" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add Milo's First Moment" })).toBeTruthy();
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
    expect(screen.queryByText(/profile is ready/i)).toBeNull();
    expect(
      mocks.trackEvent.mock.calls.some(([event]) => event === AnalyticsEvent.PetCreated)
    ).toBe(false);
  });

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
      await screen.findByRole("heading", { name: "Milo's profile is ready!" })
    ).toBeTruthy();
  });
});
