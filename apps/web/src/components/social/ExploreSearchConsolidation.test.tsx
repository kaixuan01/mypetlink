// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeciesFilterSelect } from "@/components/social/SpeciesFilterSelect";
import { SocialSearchDialog } from "@/components/social/SocialSearchDialog";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * Explore's two discovery controls, and the shape they take on each screen.
 *
 * The filter used to be a chip per species and search used to be a separate
 * top-level page. Both were the same mistake in different places: a discovery
 * tool given more room than the thing it discovers.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

const species = [
  { species: "Cat", label: "Cats", petCount: 4 },
  { species: "Dog", label: "Dogs", petCount: 2 },
  { species: "Rabbit", label: "Rabbits", petCount: 1 },
];

afterEach(cleanup);

describe("the species filter", () => {
  it("is one control, not a row that grows with the catalogue", () => {
    render(
      <SpeciesFilterSelect onChange={vi.fn()} options={species} value="all" />
    );

    // Closed, exactly one control is on screen and it says what is shown.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByTestId("species-filter-trigger").textContent).toContain(
      "All pets"
    );
  });

  it("names itself and its current value for a screen reader", () => {
    render(
      <SpeciesFilterSelect onChange={vi.fn()} options={species} value="Cat" />
    );

    const trigger = screen.getByTestId("species-filter-trigger");

    expect(trigger.getAttribute("aria-label")).toBe(
      "Filter pets by type. Cats selected."
    );
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("is a bottom sheet on a phone and a popover on a desktop", () => {
    render(
      <SpeciesFilterSelect onChange={vi.fn()} options={species} value="all" />
    );

    fireEvent.click(screen.getByTestId("species-filter-trigger"));
    const panel = screen.getByTestId("species-filter-panel");

    // Phone: pinned to the bottom edge, full width, rounded at the top — a
    // sheet, reachable by a thumb.
    expect(panel.className).toContain("fixed");
    expect(panel.className).toContain("inset-x-0");
    expect(panel.className).toContain("bottom-0");
    expect(panel.className).toContain("rounded-t-");

    // Desktop: anchored under its own trigger and only as wide as it needs to
    // be. A full modal for a single-select filter would be far too much.
    expect(panel.className).toContain("sm:absolute");
    expect(panel.className).toContain("sm:top-[calc(100%+0.5rem)]");
    expect(panel.className).toContain("sm:w-64");

    // The sheet's backdrop belongs to the sheet only: a desktop popover leaves
    // the page behind it usable.
    const backdrop = document.querySelector(".fixed.inset-0");
    expect(backdrop?.className).toContain("sm:hidden");
  });

  it("applies a choice immediately, with nothing left to confirm", () => {
    const onChange = vi.fn();
    render(
      <SpeciesFilterSelect onChange={onChange} options={species} value="all" />
    );

    fireEvent.click(screen.getByTestId("species-filter-trigger"));
    fireEvent.click(screen.getByRole("option", { name: /Dogs/ }));

    expect(onChange).toHaveBeenCalledWith("Dog");
    // Single-select: the choice is the whole decision, so there is no Apply and
    // the panel gets out of the way.
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
    expect(screen.queryByTestId("species-filter-panel")).toBeNull();
  });

  it("puts focus back on the trigger after choosing", () => {
    render(
      <SpeciesFilterSelect onChange={vi.fn()} options={species} value="all" />
    );

    const trigger = screen.getByTestId("species-filter-trigger");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /Cats/ }));

    // The panel is gone, so focus has to land somewhere deliberate. This one
    // the component owns outright, unlike the dialog's inert background.
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape without changing the filter", () => {
    const onChange = vi.fn();
    render(
      <SpeciesFilterSelect onChange={onChange} options={species} value="all" />
    );

    fireEvent.click(screen.getByTestId("species-filter-trigger"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("species-filter-panel")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByTestId("species-filter-trigger")
    );
  });

  it("offers the list as options, marking the current one", () => {
    render(
      <SpeciesFilterSelect onChange={vi.fn()} options={species} value="Cat" />
    );

    fireEvent.click(screen.getByTestId("species-filter-trigger"));
    const panel = screen.getByTestId("species-filter-panel");
    const options = within(panel).getAllByRole("option");

    // All pets, then whatever the species endpoint returned — no second
    // taxonomy, and nothing hardcoded.
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "All pets",
      "Cats4",
      "Dogs2",
      "Rabbits1",
    ]);
    expect(
      options.filter((option) => option.getAttribute("aria-selected") === "true")
    ).toHaveLength(1);
  });

  it("moves between options with the arrow keys", () => {
    render(
      <SpeciesFilterSelect onChange={vi.fn()} options={species} value="all" />
    );

    fireEvent.click(screen.getByTestId("species-filter-trigger"));
    const options = within(
      screen.getByTestId("species-filter-panel")
    ).getAllByRole("option");

    // Opens on the current choice, so Down moves from where the reader is
    // rather than from the top of a list that may be twenty long.
    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);

    fireEvent.keyDown(options[1], { key: "End" });
    expect(document.activeElement).toBe(options[options.length - 1]);
  });
});

describe("search, wherever it is opened", () => {
  it("is full screen on a phone and a centred dialog on a desktop", () => {
    render(<SocialSearchDialog onClose={vi.fn()} open />);

    const dialog = screen.getByRole("dialog");
    const panel = screen.getByTestId("social-search-dialog").closest("div[class*='flex']")
      ?.parentElement as HTMLElement;

    // Phone: the whole screen, sized against the keyboard inset — a half-height
    // sheet would leave almost nothing for results once the keyboard is up.
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("inset-0");
    expect(panel.className).toContain("h-[calc(100dvh-var(--owner-keyboard-inset))]");

    // Desktop: centred, and 672px — inside the 600–700px this wants.
    expect(dialog.className).toContain("sm:place-items-center");
    expect(panel.className).toContain("sm:max-w-2xl");
    expect(panel.className).toContain("sm:h-auto");
    expect(panel.className).toContain("sm:rounded-");
  });

  it("is a real dialog, titled, with a close control", () => {
    render(<SocialSearchDialog onClose={vi.fn()} open />);

    const dialog = screen.getByRole("dialog");

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(document.getElementById(titleId!)?.textContent).toBe(
      "Search MyPetLink"
    );
    expect(within(dialog).getByLabelText("Close dialog")).toBeTruthy();
  });

  it("focuses the box, because opening it is the act of asking to search", () => {
    render(<SocialSearchDialog onClose={vi.fn()} open />);

    expect(document.activeElement).toBe(
      screen.getByTestId("social-search-input")
    );
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<SocialSearchDialog onClose={onClose} open />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("sits above the bottom navigation rather than hiding it by hand", () => {
    render(<SocialSearchDialog onClose={vi.fn()} open />);

    // The bar is z-30; the dialog's backdrop is the shared backdrop layer, which
    // is above it. Nothing has to reach into the navigation and switch it off,
    // and the same hook makes it inert while search is open.
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("style")).toContain("--owner-layer-backdrop");
    expect(read("components/layouts/MobileBottomNavShell.tsx")).toContain("z-30");
  });

  it("has keyboard-reachable tabs and result rows", () => {
    render(<SocialSearchDialog onClose={vi.fn()} open />);

    const dialog = screen.getByRole("dialog");

    // Tabs are buttons with pressed state, not styled divs.
    const pets = within(dialog).getByRole("button", { name: /^Pets/ });
    expect(pets.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(dialog).getByRole("button", { name: /^Pet Parents/ })
    ).toBeTruthy();

    // And rows are links, so they are reachable and openable by keyboard
    // without any handler of our own — see the search view tests for the hrefs.
    expect(read("components/social/SocialSearchExperience.tsx")).toContain(
      "<Link"
    );
  });
});

describe("one search implementation", () => {
  it("is the same component in the dialog and on the route", () => {
    for (const shell of [
      "components/social/SocialSearchDialog.tsx",
      "components/social/SocialSearchView.tsx",
    ]) {
      expect(read(shell)).toContain("SocialSearchExperience");
    }

    // The shells hold no search of their own: no input, no tabs, no request.
    for (const shell of [
      "components/social/SocialSearchDialog.tsx",
      "components/social/SocialSearchView.tsx",
    ]) {
      expect(read(shell)).not.toContain("searchSocial");
      expect(read(shell)).not.toContain("<input");
    }
  });

  it("keeps /search as a real route rather than an overlay-only feature", () => {
    const page = read("app/search/page.tsx");

    expect(page).toContain("SocialSearchView");
    // Still a statically exported page reading its own query string on the
    // client, which is what makes a shared /search?q=… link work.
    expect(page).toContain("Suspense");
  });

  it("keeps the standalone page's Explore link comfortably tappable", () => {
    const view = read("components/social/SocialSearchView.tsx");

    expect(view).toContain("inline-flex min-h-10 items-center");
  });

  it("is not a sixth place to go", () => {
    const navigation = read("lib/socialNavigation.ts");

    // Community navigation is Home, Explore, Share, Activity, Profile. Search
    // is a tool Explore opens, and it stays out of the bar and the sidebar.
    expect(navigation).not.toMatch(/id:\s*"search"/);
    expect(navigation).toContain('"feed"');
    expect(navigation).toContain('"explore"');
    expect(navigation).toContain('"create"');
    expect(navigation).toContain('"activity"');
    expect(navigation).toContain('"profile"');
  });

  it("reuses the shared dialog rather than trapping focus itself", () => {
    const dialog = read("components/social/SocialSearchDialog.tsx");

    expect(dialog).toContain("FormDialog");
    // No second focus trap, no second Escape handler, no second body lock. The
    // hook is named in the comment explaining why, so this looks for the call.
    expect(dialog).not.toContain("useModalDialogFocus(");
    expect(dialog).not.toContain("addEventListener");
    expect(dialog).not.toContain('key === "Escape"');
  });
});
