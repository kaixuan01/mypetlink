// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
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
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
  };
});

const { PetProfileForm } = await import("./PetProfileForm");

const editPet = {
  ...structuredClone(mockPets[0]),
  breed: "",
  gender: "",
  personalityTags: [],
  favoriteFoods: [],
  favoriteToys: [],
};

async function renderEditForm() {
  render(<PetProfileForm initialPet={editPet} mode="edit" />);
  await screen.findByRole("tab", { name: /Basic Info/ });
}

function personalityGroup() {
  return screen.getByRole("group", { name: "Suggested personality tags" });
}

function addCustom(fieldLabel: string, value: string) {
  const input = screen.getByLabelText(`${fieldLabel}: add your own`);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function chooseCustomSelectOption(
  controlName: RegExp | string,
  option: RegExp | string
) {
  fireEvent.click(screen.getByRole("combobox", { name: controlName }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

beforeEach(() => {
  window.history.replaceState({}, "", `/pets/${mockPets[0].id}/edit`);
  mocks.getPetById.mockResolvedValue({ data: structuredClone(editPet) });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("personality tag picker", () => {
  it("shows a limited suggestion row with More suggestions for the rest", async () => {
    await renderEditForm();

    const group = personalityGroup();
    // Dog has 8 suggestions; 6 initial + a More button revealing the rest.
    expect(within(group).getAllByRole("button")).toHaveLength(7);
    const more = within(group).getByRole("button", {
      name: /More suggestions \(2\)/,
    });
    fireEvent.click(more);
    expect(within(group).getAllByRole("button")).toHaveLength(8);
  });

  it("selects a suggested tag and removes it on tap", async () => {
    await renderEditForm();

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

  it("adds trimmed custom tags, prevents duplicates, and caps at five", async () => {
    await renderEditForm();

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

  it("preserves selected tags and swaps suggestions when Pet Type changes", async () => {
    await renderEditForm();

    addCustom("Personality tags", "Snuggly");
    fireEvent.click(
      within(personalityGroup()).getByRole("button", { name: "Brave" })
    );

    const trigger = screen.getByRole("combobox", { name: "Pet type" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /^Cat$/ }));

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
  it("adds suggested and custom values as removable chips with a limit of three", async () => {
    await renderEditForm();

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

  it("offers species toys and allows removal", async () => {
    await renderEditForm();

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
  it("uses a single segmented control with three options", async () => {
    await renderEditForm();

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
  it("uses shared custom indicators for searchable, select, and date controls", async () => {
    await renderEditForm();

    for (const name of ["Pet type", "Breed"]) {
      const trigger = screen.getByRole("combobox", { name });
      const icons = trigger.querySelectorAll("svg");

      expect(icons).toHaveLength(1);
      expect(icons[0].classList.contains("pointer-events-none")).toBe(true);
      expect(
        trigger.querySelector("span")?.classList.contains("truncate")
      ).toBe(true);
    }

    const ageMode = screen.getByRole("combobox", {
      name: /Age information/,
    });
    expect(ageMode.querySelector("svg")).toBeTruthy();

    chooseCustomSelectOption(/Age information/, "Exact birthday");
    const birthday = screen.getByLabelText(
      /Exact birthday/
    ) as HTMLInputElement;
    expect(birthday.type).toBe("date");
    expect(birthday.classList.contains("brand-date-input")).toBe(true);
    expect(
      birthday
        .parentElement
        ?.querySelectorAll(".brand-date-indicator svg")
    ).toHaveLength(1);
  });

  it("preserves the conditional native age controls when the age mode changes", async () => {
    await renderEditForm();

    chooseCustomSelectOption(/Age information/, /^Estimated birth year/);

    expect(screen.queryByLabelText(/Exact birthday/)).toBeNull();
    const estimatedYear = screen.getByLabelText(
      /Estimated birth year/
    ) as HTMLSelectElement;
    expect(estimatedYear.classList.contains("brand-select")).toBe(true);

    chooseCustomSelectOption(/Age information/, "Unknown");
    expect(screen.queryByLabelText(/Estimated birth year/)).toBeNull();
    expect(screen.getByText(/birth date and estimated year are not known/i)).toBeTruthy();
  });
});

describe("shared pet selection controls", () => {
  it("opens Pet Type without focusing search, focuses it explicitly, and restores trigger focus on Escape", async () => {
    await renderEditForm();

    const trigger = screen.getByRole("combobox", { name: "Pet type" });
    fireEvent.click(trigger);

    const search = screen.getByRole("searchbox", { name: "Search pet type" });
    expect(document.activeElement).not.toBe(search);
    expect(["INPUT", "TEXTAREA"]).not.toContain(document.activeElement?.tagName);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBeTruthy();
    expect(trigger.getAttribute("aria-activedescendant")).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Pet type" })).toBeTruthy();

    search.focus();
    expect(search).toBe(document.activeElement);
    fireEvent.keyDown(search, { key: "Escape" });
    expect(trigger).toBe(document.activeElement);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("uses shared keyboard navigation to change Pet Type", async () => {
    await renderEditForm();

    const trigger = screen.getByRole("combobox", { name: "Pet type" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(trigger.textContent).toContain("Cat");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps Age Information as the three exact shared Select choices", async () => {
    await renderEditForm();

    const trigger = screen.getByRole("combobox", { name: "Age information" });
    fireEvent.click(trigger);

    expect(screen.queryByRole("searchbox")).toBeNull();
    const listbox = screen.getByRole("listbox", { name: "Age information" });
    expect(
      within(listbox).getAllByRole("option").map((option) =>
        option.textContent?.replace("Selected", "")
      )
    ).toEqual(["Exact birthday", "Estimated birth year", "Unknown"]);
  });
});

describe("breed selector", () => {
  it("does not focus the filter when a long Breed list opens", async () => {
    await renderEditForm();

    const trigger = screen.getByRole("combobox", { name: "Breed" });
    fireEvent.click(trigger);
    const search = screen.getByRole("searchbox", { name: "Search breed" });

    expect(document.activeElement).not.toBe(search);
    expect(["INPUT", "TEXTAREA"]).not.toContain(document.activeElement?.tagName);
    search.focus();
    expect(search).toBe(document.activeElement);
  });

  it("omits the filter for a short species Breed list", async () => {
    await renderEditForm();

    chooseCustomSelectOption("Pet type", "Rabbit");
    fireEvent.click(screen.getByRole("combobox", { name: "Breed" }));

    expect(screen.queryByRole("searchbox", { name: "Search breed" })).toBeNull();
    expect(screen.getByRole("option", { name: "Holland Lop" })).toBeTruthy();
  });

  it("is searchable and always offers Mixed breed, Unknown, and Other", async () => {
    await renderEditForm();

    fireEvent.click(screen.getByRole("combobox", { name: "Breed" }));
    for (const option of ["Mixed breed", "Unknown", "Other"]) {
      expect(screen.getByRole("option", { name: option })).toBeTruthy();
    }

    fireEvent.change(screen.getByLabelText("Search breed"), {
      target: { value: "poo" },
    });
    expect(screen.getByRole("option", { name: "Poodle" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Corgi" })).toBeNull();
  });

  it("reveals custom input when Other is selected", async () => {
    await renderEditForm();

    chooseCustomSelectOption("Breed", "Other");

    const custom = screen.getByLabelText("Enter breed");
    fireEvent.change(custom, { target: { value: "Axolotl mix" } });
    expect(custom).toHaveProperty("value", "Axolotl mix");
  });

  it("keeps a custom breed while switching species and can replace it with a curated breed", async () => {
    await renderEditForm();

    chooseCustomSelectOption("Breed", "Poodle");
    chooseCustomSelectOption("Pet type", "Rabbit");

    expect(screen.getByLabelText("Enter breed")).toHaveProperty("value", "Poodle");
    chooseCustomSelectOption("Breed", "Holland Lop");
    expect(screen.queryByLabelText("Enter breed")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Breed" }).textContent).toContain(
      "Holland Lop"
    );
  });

  it("prevents no-match Enter in Breed search from submitting the form", async () => {
    await renderEditForm();

    const form = screen.getByRole("combobox", { name: "Breed" }).closest("form")!;
    const submitted = vi.fn();
    form.addEventListener("submit", submitted);
    fireEvent.click(screen.getByRole("combobox", { name: "Breed" }));
    const search = screen.getByRole("searchbox", { name: "Search breed" });
    fireEvent.change(search, { target: { value: "no-such-breed" } });

    expect(fireEvent.keyDown(search, { key: "Enter" })).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
  });
});

describe("bio inspiration sheet", () => {
  it("opens templates on request and inserts editable text", async () => {
    await renderEditForm();

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
