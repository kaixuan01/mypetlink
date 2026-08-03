// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/services/petService", () => ({
  getFriendlyApiErrorMessage: () => "We couldn't load your pet profiles.",
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));

vi.mock("@/components/portal/TagOrderFlow", () => ({
  TagOrderFlow: ({
    pets,
    preselectedPetId,
  }: {
    pets: { id: string; name: string }[];
    preselectedPetId: string;
  }) => (
    <div>
      Order flow for {preselectedPetId}; pets: {pets.map((pet) => pet.name).join(", ")}
    </div>
  ),
}));

const { SmartTagOrderEntry } = await import("./SmartTagOrderEntry");

beforeEach(() => {
  window.history.replaceState({}, "", "/tags/order");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SmartTagOrderEntry", () => {
  it("redirects a successful zero-pet result to contextual Add Pet once", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });

    render(<SmartTagOrderEntry />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/pets/new?returnTo=%2Ftags%2Forder"
      )
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("preselects the only active pet instead of redirecting", async () => {
    mocks.getPets.mockResolvedValue({ data: [mockPets[0]] });

    render(<SmartTagOrderEntry />);

    expect(
      await screen.findByText(`Order flow for ${mockPets[0].id}; pets: ${mockPets[0].name}`)
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows all active pets for an explicit multi-pet choice", async () => {
    const archivedPet = {
      ...mockPets[0],
      id: "pet_archived",
      name: "Archived pet",
      lifecycleStatus: "Archived" as const,
    };
    mocks.getPets.mockResolvedValue({ data: [...mockPets, archivedPet] });

    render(<SmartTagOrderEntry />);

    expect(await screen.findByText("Who is this physical tag for?")).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(mockPets[0].name) })).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(mockPets[1].name) })).toBeTruthy();
    expect(screen.queryByText("Archived pet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(mockPets[1].name) }));
    expect(
      await screen.findByText(
        `Order flow for ${mockPets[1].id}; pets: ${mockPets.map((pet) => pet.name).join(", ")}`
      )
    ).toBeTruthy();
  });

  it("keeps loading distinct from an empty result", () => {
    mocks.getPets.mockReturnValue(new Promise(() => undefined));

    render(<SmartTagOrderEntry />);

    expect(screen.getByRole("status").textContent).toContain(
      "Loading your pet profiles"
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows a retryable error and recovers without an Add Pet redirect", async () => {
    mocks.getPets
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: [mockPets[0]] });

    render(<SmartTagOrderEntry />);

    expect(await screen.findByText("Pet profiles could not load")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    expect(
      await screen.findByText(`Order flow for ${mockPets[0].id}; pets: ${mockPets[0].name}`)
    ).toBeTruthy();
    expect(mocks.getPets).toHaveBeenCalledTimes(2);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps an active pet eligible when optional profile fields are blank", async () => {
    const incompletePet = {
      ...mockPets[0],
      breed: "",
      color: "",
      bio: "",
      photoUrl: "",
    };
    mocks.getPets.mockResolvedValue({ data: [incompletePet] });

    render(<SmartTagOrderEntry />);

    expect(
      await screen.findByText(`Order flow for ${incompletePet.id}; pets: ${incompletePet.name}`)
    ).toBeTruthy();
  });

  it("recognizes a stored pet on a direct refresh and honors an owned preference", async () => {
    window.history.replaceState(
      {},
      "",
      `/tags/order?pet=${encodeURIComponent(mockPets[1].id)}`
    );
    mocks.getPets.mockResolvedValue({ data: mockPets });

    render(<SmartTagOrderEntry />);

    expect(
      await screen.findByText(
        `Order flow for ${mockPets[1].id}; pets: ${mockPets.map((pet) => pet.name).join(", ")}`
      )
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("ignores a preferred pet that is archived or absent", async () => {
    window.history.replaceState({}, "", "/tags/order?pet=pet_archived");
    const archivedPet = {
      ...mockPets[0],
      id: "pet_archived",
      name: "Archived pet",
      lifecycleStatus: "Archived" as const,
    };
    mocks.getPets.mockResolvedValue({ data: [...mockPets, archivedPet] });

    render(<SmartTagOrderEntry />);

    expect(await screen.findByText("Who is this physical tag for?")).toBeTruthy();
    expect(screen.queryByText("Archived pet")).toBeNull();
  });
});
