// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
  getFriendlyApiErrorMessage: () => "Please try again.",
}));

const { GlobalAddMenu } = await import("./GlobalAddMenu");

function makePets(count: number): Pet[] {
  return Array.from({ length: count }, (_, index) => ({
    ...mockPets[0],
    id: `pet_${index}`,
    name: `Pet ${index}`,
    lifecycleStatus: "Active",
  }));
}

async function openMenu() {
  const trigger = screen.getByRole("button", {
    name: /add a pet, care record, or moment/i,
  });
  fireEvent.click(trigger);
  return trigger;
}

describe("GlobalAddMenu", () => {
  beforeEach(() => {
    mocks.getPets.mockReset();
    mocks.push.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("exposes an accessible trigger that toggles aria-expanded", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<GlobalAddMenu variant="compact" />);

    const trigger = screen.getByRole("button", {
      name: /add a pet, care record, or moment/i,
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("offers Add Pet, Add Care Record, and Add Pet Moment with correct routes", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<GlobalAddMenu variant="compact" />);
    await openMenu();

    const addPet = await screen.findByRole("menuitem", {
      name: /create a new pet profile/i,
    });
    const addRecord = screen.getByRole("menuitem", {
      name: /log a vaccine, vet visit, or note/i,
    });
    const addMoment = screen.getByRole("menuitem", {
      name: /save a photo or memory/i,
    });

    expect(addPet.getAttribute("href")).toBe("/pets/new");
    expect(addRecord.getAttribute("href")).toBe("/records");
    expect(addMoment.getAttribute("href")).toBe("/moments");
  });

  it("disables record and moment actions when there are no pets", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });
    render(<GlobalAddMenu variant="compact" />);
    await openMenu();

    // Add Pet is still available for a brand-new owner.
    const addPet = await screen.findByRole("menuitem", {
      name: /create a new pet profile/i,
    });
    expect(addPet.getAttribute("href")).toBe("/pets/new");

    const recordAndMoment = screen.getAllByText(/add your first pet to use this/i);
    expect(recordAndMoment).toHaveLength(2);

    const disabled = screen
      .getAllByRole("menuitem")
      .filter((item) => item.getAttribute("aria-disabled") === "true");
    expect(disabled).toHaveLength(2);
  });

  it("keeps Add Pet reachable at the plan limit and explains the limit", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(3) });
    render(<GlobalAddMenu variant="compact" />);
    await openMenu();

    const addPet = await screen.findByRole("menuitem", {
      name: /free profile limit reached/i,
    });
    // It is a button (opens the limit explanation), not a navigation link.
    expect(addPet.tagName).toBe("BUTTON");

    fireEvent.click(addPet);
    expect(
      screen.getByText("Free profile limit reached", { selector: "h2" })
    ).toBeTruthy();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<GlobalAddMenu variant="compact" />);
    const trigger = await openMenu();

    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
