// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CTAButton } from "@/components/ui/CTAButton";

/**
 * The icon-only mode of the shared call-to-action.
 *
 * The visitor header used to shrink this button into a circle by passing
 * `w-12 px-0` next to the button's own `px-5`. Both classes reached the
 * element and the stylesheet, not the caller, decided: `px-5` won, leaving 6px
 * of a 48px circle for a 16px icon — a coral dot with no symbol. The mode owns
 * its padding instead, so there is nothing to fight over.
 */

function tokens(element: Element) {
  return element.className.split(/\s+/);
}

afterEach(cleanup);

describe("CTAButton, icon only until md", () => {
  it("is a 48px circle with no competing padding", () => {
    render(
      <CTAButton icon="paw" iconOnlyUntil="md">
        Create Free Pet Profile
      </CTAButton>
    );

    const button = tokens(screen.getByRole("button"));

    expect(button).toEqual(expect.arrayContaining(["h-12", "w-12", "p-0", "gap-0", "shrink-0"]));
    // No unprefixed padding or gap from the ordinary pill.
    expect(button).not.toContain("px-5");
    expect(button).not.toContain("py-3");
    expect(button).not.toContain("gap-2");
  });

  it("keeps the icon at full size", () => {
    render(
      <CTAButton icon="paw" iconOnlyUntil="md">
        Create Free Pet Profile
      </CTAButton>
    );

    const icon = screen.getByRole("button").querySelector("svg");

    expect(icon?.getAttribute("class")).toContain("h-4 w-4 shrink-0");
  });

  it("keeps the label as the accessible name, and shows it from md up", () => {
    render(
      <CTAButton icon="paw" iconOnlyUntil="md">
        Create Free Pet Profile
      </CTAButton>
    );

    const button = screen.getByRole("button", { name: "Create Free Pet Profile" });
    const label = button.querySelector("span");

    expect(label?.className).toContain("sr-only");
    expect(label?.className).toContain("md:not-sr-only");
  });

  it("becomes the ordinary pill from md up", () => {
    render(
      <CTAButton icon="paw" iconOnlyUntil="md">
        Create Free Pet Profile
      </CTAButton>
    );

    expect(tokens(screen.getByRole("button"))).toEqual(
      expect.arrayContaining(["md:h-auto", "md:w-auto", "md:gap-2", "md:px-5", "md:py-3"])
    );
  });

  it("stays an ordinary pill when there is no icon to show", () => {
    render(<CTAButton iconOnlyUntil="md">Continue</CTAButton>);

    const button = screen.getByRole("button", { name: "Continue" });

    // Without an icon the circle would be empty, so the mode does not apply.
    expect(tokens(button)).toEqual(expect.arrayContaining(["gap-2", "px-5", "py-3"]));
    expect(button.querySelector(".sr-only")).toBeNull();
  });
});

describe("CTAButton, default", () => {
  it("is unchanged: padded pill, icon and visible label", () => {
    render(
      <CTAButton icon="paw" variant="coral">
        Create Free Pet Profile
      </CTAButton>
    );

    const button = screen.getByRole("button", { name: "Create Free Pet Profile" });

    expect(tokens(button)).toEqual(
      expect.arrayContaining(["inline-flex", "min-h-12", "gap-2", "px-5", "py-3", "rounded-full"])
    );
    expect(tokens(button)).not.toContain("w-12");
    expect(button.querySelector(".sr-only")).toBeNull();
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("h-4 w-4");
  });
});
