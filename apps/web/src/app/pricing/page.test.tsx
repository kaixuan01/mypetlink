// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import PricingPage from "./page";

afterEach(cleanup);

describe("PricingPage product hierarchy", () => {
  it("separates profiles, the one-time Smart Tag, and future GPS products", () => {
    render(<PricingPage />);

    expect(screen.getByRole("heading", { name: "MyPetLink Profile" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Smart Tag" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Coming Later" })).toBeTruthy();
    expect(screen.queryByText("Smart Tag Add-ons")).toBeNull();

    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Premium" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Free Profile" })).toBeTruthy();

    const premiumCard = screen
      .getByRole("heading", { name: "Premium" })
      .closest("article");
    expect(premiumCard).toBeTruthy();
    expect(within(premiumCard!).getAllByText("Coming Soon").length).toBeGreaterThan(0);
    expect(within(premiumCard!).getByText("Care reminders")).toBeTruthy();
  });

  it("offers the QR + NFC Smart Tag as the only physical product", () => {
    render(<PricingPage />);

    const nfcCard = screen
      .getByRole("heading", { name: "MyPetLink QR + NFC Smart Tag" })
      .closest("article");

    expect(nfcCard).toBeTruthy();
    expect(within(nfcCard!).getByText("RM39.90")).toBeTruthy();
    expect(within(nfcCard!).getByText("One-time purchase")).toBeTruthy();
    expect(within(nfcCard!).getByText("QR scan")).toBeTruthy();
    expect(within(nfcCard!).getByText("NFC tap")).toBeTruthy();

    const action = within(nfcCard!).getByRole("button", { name: "Coming Soon" });
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it("no longer sells a scan-only tag", () => {
    const { container } = render(<PricingPage />);

    expect(screen.queryByRole("heading", { name: "MyPetLink QR Pet Tag" })).toBeNull();
    expect(container.textContent).not.toContain("RM19.90");
    expect(container.textContent).not.toContain("QR Pet Tag");
  });

  it("presents GPS as a teaser with no price or ordering action", () => {
    render(<PricingPage />);

    const gpsCard = screen.getByRole("heading", { name: "GPS Safety" }).closest("article");
    expect(gpsCard).toBeTruthy();
    expect(within(gpsCard!).getByText("Coming Later")).toBeTruthy();
    expect(within(gpsCard!).queryByRole("button")).toBeNull();
    expect(within(gpsCard!).queryByText(/RM\d/)).toBeNull();
  });
});
