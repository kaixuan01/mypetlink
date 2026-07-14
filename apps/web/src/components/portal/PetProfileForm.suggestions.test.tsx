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

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => false,
  isApiConfigured: () => false,
}));

const { PetProfileForm } = await import("./PetProfileForm");

function renderCreateForm() {
  render(<PetProfileForm mode="create" />);
}

function personalityGroup() {
  return screen.getByRole("group", { name: "Suggested personality tags" });
}

function addCustom(fieldLabel: string, value: string) {
  const input = screen.getByLabelText(`${fieldLabel}: add your own`);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/pets/new");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("personality tag picker", () => {
  it("shows a limited suggestion row with More suggestions for the rest", () => {
    renderCreateForm();

    const group = personalityGroup();
    // Dog has 8 suggestions; 6 initial + a More button revealing the rest.
    expect(within(group).getAllByRole("button")).toHaveLength(7);
    const more = within(group).getByRole("button", {
      name: /More suggestions \(2\)/,
    });
    fireEvent.click(more);
    expect(within(group).getAllByRole("button")).toHaveLength(8);
  });

  it("selects a suggested tag and removes it on tap", () => {
    renderCreateForm();

    fireEvent.click(
      within(personalityGroup()).getByRole("button", { name: "Brave" })
    );
    expect(screen.getByRole("button", { name: "Remove Brave" })).toBeTruthy();
    expect(
      within(personalityGroup()).queryByRole("button", { name: "Brave" })
    ).toBeNull();
    expect(screen.getByText("1/5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove Brave" }));
    expect(screen.queryByRole("button", { name: "Remove Brave" })).toBeNull();
  });

  it("adds trimmed custom tags, prevents duplicates, and caps at five", () => {
    renderCreateForm();

    addCustom("Personality tags", "  Snuggly  ");
    addCustom("Personality tags", "snuggly");
    expect(
      screen.getAllByRole("button", { name: "Remove Snuggly" })
    ).toHaveLength(1);

    for (const tag of ["Two", "Three", "Four", "Five", "Six"]) {
      addCustom("Personality tags", tag);
    }

    expect(screen.getByText("5/5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Six" })).toBeNull();
    expect(
      (
        screen.getByLabelText(
          "Personality tags: add your own"
        ) as HTMLInputElement
      ).disabled
    ).toBe(true);
  });

  it("preserves selected tags and swaps suggestions when Pet Type changes", () => {
    renderCreateForm();

    addCustom("Personality tags", "Snuggly");
    fireEvent.click(
      within(personalityGroup()).getByRole("button", { name: "Brave" })
    );

    const trigger = screen.getByRole("button", { name: "Pet type" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /^Cat$/ }));

    expect(screen.getByRole("button", { name: "Remove Snuggly" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Brave" })).toBeTruthy();
    expect(
      within(personalityGroup()).getByRole("button", { name: "Cuddly" })
    ).toBeTruthy();
    expect(
      within(personalityGroup()).queryByRole("button", { name: "Happy" })
    ).toBeNull();
  });
});

describe("favourite foods and toys", () => {
  it("adds suggested and custom values as removable chips with a limit of three", () => {
    renderCreateForm();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Suggested favourite foods" })
      ).getByRole("button", { name: "Chicken" })
    );
    addCustom("Favourite foods", "Rendang");
    addCustom("Favourite foods", "rendang");
    addCustom("Favourite foods", "Kibble");
    addCustom("Favourite foods", "Fourth");

    expect(screen.getByRole("button", { name: "Remove Chicken" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Rendang" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Kibble" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Fourth" })).toBeNull();
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  it("offers species toys and allows removal", () => {
    renderCreateForm();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Suggested favourite toys" })
      ).getByRole("button", { name: "Squeaky ball" })
    );
    expect(
      screen.getByRole("button", { name: "Remove Squeaky ball" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove Squeaky ball" }));
    expect(
      screen.queryByRole("button", { name: "Remove Squeaky ball" })
    ).toBeNull();
  });
});

describe("gender segmented control", () => {
  it("uses a single segmented control with three options", () => {
    renderCreateForm();

    const group = screen.getByRole("radiogroup", { name: "Gender" });
    const options = within(group).getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual([
      "Male",
      "Female",
      "Unknown",
    ]);

    fireEvent.click(within(group).getByRole("radio", { name: "Female" }));
    expect(
      within(group)
        .getByRole("radio", { name: "Female" })
        .getAttribute("aria-checked")
    ).toBe("true");
  });
});

describe("pet detail dropdown indicators", () => {
  it("uses shared custom indicators for searchable, select, and date controls", () => {
    renderCreateForm();

    for (const name of ["Pet type", "Breed"]) {
      const trigger = screen.getByRole("button", { name });
      const icons = trigger.querySelectorAll("svg");

      expect(icons).toHaveLength(1);
      expect(icons[0].classList.contains("pointer-events-none")).toBe(true);
      expect(
        trigger.querySelector("span")?.classList.contains("truncate")
      ).toBe(true);
    }

    const ageMode = screen.getByLabelText(
      /Age information/
    ) as HTMLSelectElement;
    expect(ageMode.classList.contains("brand-select")).toBe(true);
    expect(ageMode.querySelector("svg")).toBeNull();

    fireEvent.change(ageMode, { target: { value: "ExactBirthday" } });
    const birthday = screen.getByLabelText(
      /Exact birthday/
    ) as HTMLInputElement;
    expect(birthday.type).toBe("date");
    expect(birthday.classList.contains("brand-date-input")).toBe(true);
    expect(
      birthday
        .closest("label")
        ?.querySelectorAll(".brand-date-indicator svg")
    ).toHaveLength(1);
  });

  it("preserves the conditional native age controls when the age mode changes", () => {
    renderCreateForm();

    const ageMode = screen.getByLabelText(
      /Age information/
    ) as HTMLSelectElement;
    fireEvent.change(ageMode, { target: { value: "EstimatedBirthYear" } });

    expect(screen.queryByLabelText(/Exact birthday/)).toBeNull();
    const estimatedYear = screen.getByLabelText(
      /Estimated birth year/
    ) as HTMLSelectElement;
    expect(estimatedYear.classList.contains("brand-select")).toBe(true);

    fireEvent.change(ageMode, { target: { value: "Unknown" } });
    expect(screen.queryByLabelText(/Estimated birth year/)).toBeNull();
    expect(screen.getByText(/birth date and estimated year are not known/i)).toBeTruthy();
  });
});

describe("breed selector", () => {
  it("is searchable and always offers Mixed breed, Unknown, and Other", () => {
    renderCreateForm();

    fireEvent.click(screen.getByRole("button", { name: "Breed" }));
    for (const option of ["Mixed breed", "Unknown", "Other"]) {
      expect(screen.getByRole("button", { name: option })).toBeTruthy();
    }

    fireEvent.change(screen.getByLabelText("Search breed"), {
      target: { value: "poo" },
    });
    expect(screen.getByRole("button", { name: "Poodle" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Corgi" })).toBeNull();
  });

  it("reveals custom input when Other is selected", () => {
    renderCreateForm();

    fireEvent.click(screen.getByRole("button", { name: "Breed" }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));

    const custom = screen.getByLabelText("Enter breed");
    fireEvent.change(custom, { target: { value: "Axolotl mix" } });
    expect(custom).toHaveProperty("value", "Axolotl mix");
  });
});

describe("bio inspiration sheet", () => {
  it("opens templates on request and inserts editable text", () => {
    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/Pet name/), {
      target: { value: "Topu" },
    });

    // Templates are not expanded in the main form.
    expect(screen.queryByRole("dialog", { name: "Bio starters" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Need inspiration?" }));
    const sheet = screen.getByRole("dialog", { name: "Bio starters" });
    const firstTemplate = within(sheet)
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("Topu"));
    fireEvent.click(firstTemplate!);

    expect(screen.queryByRole("dialog", { name: "Bio starters" })).toBeNull();
    const bio = screen.getByLabelText(
      /Short bio \/ description/
    ) as HTMLTextAreaElement;
    expect(bio.value).toContain("Topu");
  });
});
