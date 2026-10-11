// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WhereToBuyTeaser } from "@/components/marketing/WhereToBuyTeaser";
import { smartTagAddOn } from "@/lib/planLimits";

afterEach(cleanup);

function availability(onlineOrderingAvailable: boolean, hasPublicRetailPartners: boolean) {
  return {
    onlineOrderingAvailable,
    hasPublicRetailPartners,
    showWhereToBuy: onlineOrderingAvailable || hasPublicRetailPartners,
  };
}

describe("Where to Buy teaser", () => {
  it("promotes online ordering, not a partner, when no public partner exists", () => {
    render(<WhereToBuyTeaser availability={availability(true, false)} />);

    expect(screen.getByRole("heading", { name: "Order your Smart Tag online." })).toBeTruthy();
    expect(screen.getByText(new RegExp(smartTagAddOn.price.replace(".", "\\.")))).toBeTruthy();
    expect(screen.getByRole("link", { name: "See How to Buy" }).getAttribute("href")).toBe(
      "/where-to-buy"
    );
    expect(screen.queryByText(/partner/i)).toBeNull();
    expect(screen.queryByText(/near you/i)).toBeNull();
  });

  it("names partners only when there is one to find", () => {
    render(<WhereToBuyTeaser availability={availability(true, true)} />);

    expect(screen.getByRole("heading", { name: "Find MyPetLink near you." })).toBeTruthy();
    expect(
      screen.getByText("Order online, or pick one up from an authorised partner.")
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find a Retail Partner" })).toBeTruthy();
  });

  it("does not mention ordering online when only partners sell the tag", () => {
    render(<WhereToBuyTeaser availability={availability(false, true)} />);

    expect(screen.getByText("Pick one up from an authorised partner near you.")).toBeTruthy();
    expect(screen.queryByText(/order online/i)).toBeNull();
  });

  it("renders nothing while there is nowhere to buy", () => {
    const { container } = render(<WhereToBuyTeaser availability={availability(false, false)} />);

    expect(container.innerHTML).toBe("");
  });
});
