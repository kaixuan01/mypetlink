// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

const { GlobalAddMenu } = await import("./GlobalAddMenu");

function makePets(count: number): Pet[] {
  return Array.from({ length: count }, (_, index) => ({
    ...mockPets[0],
    id: `pet_${index}`,
    name: `Pet ${index + 1}`,
    lifecycleStatus: "Active",
  }));
}

function renderMenu(pets = makePets(1)) {
  return render(<GlobalAddMenu pets={pets} />);
}

function getTrigger() {
  return screen.getByRole("button", {
    name: /add a pet, care record, or moment/i,
  });
}

function openMenu() {
  const trigger = getTrigger();
  fireEvent.click(trigger);
  return trigger;
}

describe("GlobalAddMenu", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard";
    mocks.push.mockReset();
    document.body.style.overflow = "";
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.clearAllMocks();
  });

  it("opens a visible portalled action surface above its backdrop", () => {
    renderMenu();
    const trigger = openMenu();

    const panel = screen.getByRole("menu");
    const backdrop = screen.getByRole("button", { name: /close add menu/i });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.classList.contains("owner-action-panel")).toBe(true);
    expect(backdrop.classList.contains("owner-action-backdrop")).toBe(true);
    expect(panel.parentElement).toBe(document.body);
    expect(backdrop.parentElement).toBe(document.body);
  });

  it("offers the three approved actions and preselects the only pet", () => {
    renderMenu(makePets(1));
    openMenu();

    expect(
      screen.getByRole("menuitem", { name: /create a new pet profile/i })
        .getAttribute("href")
    ).toBe("/pets/new");
    expect(
      screen.getByRole("menuitem", {
        name: /log a vaccine, vet visit, or note/i,
      }).getAttribute("href")
    ).toBe("/pets/pet_0/records?create=1");
    expect(
      screen.getByRole("menuitem", { name: /save a photo or memory/i })
        .getAttribute("href")
    ).toBe("/pets/pet_0/moments/new");
  });

  it("disables pet-dependent actions with a visible zero-pet explanation", () => {
    renderMenu([]);
    openMenu();

    expect(screen.getAllByText("Create a pet first")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("menuitem")
        .filter((item) => item.getAttribute("aria-disabled") === "true")
    ).toHaveLength(2);
  });

  it("asks which pet to use when several pets exist", () => {
    renderMenu(makePets(2));
    openMenu();

    fireEvent.click(
      screen.getByRole("menuitem", {
        name: /log a vaccine, vet visit, or note.*choose a pet/i,
      })
    );

    expect(screen.getByText("Choose a pet for the record")).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /pet 1.*add a care record/i })
        .getAttribute("href")
    ).toBe("/pets/pet_0/records?create=1");
    expect(
      screen.getByRole("menuitem", { name: /pet 2.*add a care record/i })
        .getAttribute("href")
    ).toBe("/pets/pet_1/records?create=1");
  });

  it("keeps Add Pet available at the plan limit and explains the limit", () => {
    renderMenu(makePets(3));
    openMenu();

    fireEvent.click(
      screen.getByRole("menuitem", { name: /free profile limit reached/i })
    );

    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.getByText("Free profile limit reached", { selector: "h2" })
    ).toBeTruthy();
  });

  it("closes on outside click and fully removes the backdrop", async () => {
    renderMenu();
    const trigger = openMenu();

    fireEvent.click(screen.getByRole("button", { name: /close add menu/i }));

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.querySelector("[data-owner-action-backdrop]")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape, restores focus, and restores body scrolling", async () => {
    renderMenu();
    const trigger = openMenu();

    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes before following a selected action", () => {
    renderMenu();
    openMenu();

    fireEvent.click(
      screen.getByRole("menuitem", { name: /save a photo or memory/i })
    );

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.querySelector("[data-owner-action-backdrop]")).toBeNull();
  });

  it("cleans up overlay and scroll state when the route changes", async () => {
    const view = renderMenu();
    openMenu();
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));

    mocks.pathname = "/pets";
    view.rerender(<GlobalAddMenu pets={makePets(1)} />);

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.body.style.overflow).toBe("");
  });

  it("remains usable after repeated open and close cycles", () => {
    renderMenu();
    const trigger = getTrigger();

    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(trigger);
      expect(screen.getByRole("menu")).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
    }

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
