// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  router: {
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => false }));

const { PetProfileForm } = await import("./PetProfileForm");

function renderCreateForm() {
  render(<PetProfileForm mode="create" />);
}

function personalityGroup() {
  return screen.getByRole("group", { name: "Suggested personality tags" });
}

function addCustomTag(tag: string) {
  const input = screen.getByLabelText("Add a personality tag");
  fireEvent.change(input, { target: { value: tag } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
}

describe("PetProfileForm personality tag picker", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/pets/new");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows dog suggestions by default and selects a tag on tap", () => {
    renderCreateForm();

    const brave = within(personalityGroup()).getByRole("button", {
      name: "Brave",
    });
    fireEvent.click(brave);

    // Selected as a removable chip and no longer offered as a suggestion.
    expect(
      screen.getByRole("button", { name: "Remove tag Brave" })
    ).toBeTruthy();
    expect(
      within(personalityGroup()).queryByRole("button", { name: "Brave" })
    ).toBeNull();
    expect(screen.getByText("1/5")).toBeTruthy();
  });

  it("adds trimmed custom tags and prevents duplicates", () => {
    renderCreateForm();

    addCustomTag("  Snuggly  ");
    addCustomTag("snuggly");

    expect(
      screen.getAllByRole("button", { name: "Remove tag Snuggly" })
    ).toHaveLength(1);
    expect(screen.getByText("1/5")).toBeTruthy();
  });

  it("removes a selected tag when tapped", () => {
    renderCreateForm();

    addCustomTag("Snuggly");
    fireEvent.click(screen.getByRole("button", { name: "Remove tag Snuggly" }));

    expect(
      screen.queryByRole("button", { name: "Remove tag Snuggly" })
    ).toBeNull();
    expect(screen.getByText("0/5")).toBeTruthy();
  });

  it("limits selections to five tags", () => {
    renderCreateForm();

    for (const tag of ["One", "Two", "Three", "Four", "Five", "Six"]) {
      addCustomTag(tag);
    }

    expect(screen.getByText("5/5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove tag Six" })).toBeNull();
    expect(
      (screen.getByLabelText("Add a personality tag") as HTMLInputElement)
        .disabled
    ).toBe(true);
  });

  it("preserves selected tags and swaps suggestions when Pet Type changes", () => {
    renderCreateForm();

    addCustomTag("Snuggly");
    fireEvent.click(
      within(personalityGroup()).getByRole("button", { name: "Brave" })
    );

    // Switch Dog -> Cat through the pet type dropdown (the trigger button is
    // labelled by its wrapping "Pet type" field label).
    const trigger = screen.getByRole("button", { name: "Pet type" });
    expect(trigger.textContent).toContain("Dog");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /^Cat$/ }));

    // Custom and previously selected tags survive the species change.
    expect(
      screen.getByRole("button", { name: "Remove tag Snuggly" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove tag Brave" })
    ).toBeTruthy();
    // Suggestions are now cat-flavoured.
    expect(
      within(personalityGroup()).getByRole("button", { name: "Cuddly" })
    ).toBeTruthy();
    expect(
      within(personalityGroup()).queryByRole("button", { name: "Happy" })
    ).toBeNull();
  });
});

describe("PetProfileForm other field suggestions", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/pets/new");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("fills favourite food and toy from species suggestions", () => {
    renderCreateForm();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Favourite food suggestions" })
      ).getByRole("button", { name: "Chicken" })
    );
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Favourite toy suggestions" })
      ).getByRole("button", { name: "Squeaky ball" })
    );

    expect(screen.getByLabelText("Favourite food")).toHaveProperty(
      "value",
      "Chicken"
    );
    expect(screen.getByLabelText("Favourite toy")).toHaveProperty(
      "value",
      "Squeaky ball"
    );
  });

  it("sets gender from a quick pick while keeping custom input available", () => {
    renderCreateForm();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Quick picks for gender" })
      ).getByRole("button", { name: "Female" })
    );
    expect(screen.getByLabelText("Gender")).toHaveProperty("value", "Female");

    fireEvent.change(screen.getByLabelText("Gender"), {
      target: { value: "Female (spayed)" },
    });
    expect(screen.getByLabelText("Gender")).toHaveProperty(
      "value",
      "Female (spayed)"
    );
  });

  it("fills the bio from a personalized starter template", () => {
    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/Pet name/), {
      target: { value: "Topu" },
    });

    const starters = screen.getByRole("group", { name: "Bio starters" });
    const firstStarter = within(starters).getAllByRole("button")[0];
    fireEvent.click(firstStarter);

    const bio = screen.getByLabelText(
      /Short bio \/ description/
    ) as HTMLTextAreaElement;
    expect(bio.value).toContain("Topu");
  });

  it("offers breed autocomplete options for the selected species", () => {
    renderCreateForm();

    const breed = screen.getByLabelText("Breed") as HTMLInputElement;
    expect(breed.getAttribute("list")).toBe("pet-breed-suggestions");

    const datalist = document.getElementById("pet-breed-suggestions");
    expect(datalist).toBeTruthy();
    expect(
      [...(datalist?.querySelectorAll("option") ?? [])].map((option) =>
        option.getAttribute("value")
      )
    ).toContain("Poodle");
  });
});
