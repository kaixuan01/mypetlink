// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import PricingPage from "./page";

afterEach(cleanup);

describe("PricingPage product hierarchy", () => {
  it("separates profiles, one-time Smart Tags, and future GPS products", () => {
    render(<PricingPage />);

    expect(screen.getByRole("heading", { name: "MyPetLink Profile" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Smart Tags" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Coming Later" })).toBeTruthy();
    expect(screen.queryByText("Smart Tag Add-ons")).toBeNull();

    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Premium" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Free Profile" })).toBeTruthy();
  });

  it("makes the QR and QR + NFC differences explicit without changing availability", () => {
    render(<PricingPage />);

    const qrCard = screen
      .getByRole("heading", { name: "MyPetLink QR Pet Tag" })
      .closest("article");
    const nfcCard = screen
      .getByRole("heading", { name: "MyPetLink QR + NFC Smart Tag" })
      .closest("article");

    expect(qrCard).toBeTruthy();
    expect(nfcCard).toBeTruthy();
    expect(within(qrCard!).getByText("RM19.90")).toBeTruthy();
    expect(within(qrCard!).getByText("One-time purchase")).toBeTruthy();
    expect(within(qrCard!).getByText("QR scan")).toBeTruthy();
    expect(within(qrCard!).queryByText("NFC tap")).toBeNull();
    expect(within(nfcCard!).getByText("RM39.90")).toBeTruthy();
    expect(within(nfcCard!).getByText("NFC tap")).toBeTruthy();

    for (const card of [qrCard!, nfcCard!]) {
      const action = within(card).getByRole("button", { name: "Coming Soon" });
      expect((action as HTMLButtonElement).disabled).toBe(true);
    }
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
