// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { QrSafetyPageView } from "@/components/marketing/QrSafetyPageView";

vi.mock("@/components/ui/PetPhotoViewer", () => ({
  PetPhotoViewer: () => <span>Pet portrait</span>,
}));

afterEach(cleanup);

it("applies the same saved theme to the QR safety profile", async () => {
  const pet = { ...mockPets[0], profileTheme: "peach" as const };
  const { container } = render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink safety page");
  const themedProfile = container.querySelector("[data-profile-theme]");
  expect(themedProfile?.getAttribute("data-profile-theme")).toBe("peach");
  expect(screen.getByText("Safety note").parentElement?.getAttribute("style"))
    .toContain("background");
});

it("shows known allergies prominently without exposing raw JSON", async () => {
  const pet = { ...mockPets[0], allergies: ["Chicken", "Penicillin"] };
  render(<QrSafetyPageView pet={pet} />);

  expect(await screen.findByText("Known allergies")).toBeTruthy();
  expect(screen.getByText("Chicken · Penicillin")).toBeTruthy();
  expect(document.body.textContent).not.toContain('["Chicken"');
});

it("hides the allergy safety section when none are saved", async () => {
  render(<QrSafetyPageView pet={{ ...mockPets[0], allergies: [] }} />);

  await screen.findByText("MyPetLink safety page");
  expect(screen.queryByText("Known allergies")).toBeNull();
});

it("adds and removes the urgent finder state from the saved Lost Mode value", async () => {
  const lostPet = { ...mockPets[0], lostModeEnabled: true };
  const { unmount } = render(<QrSafetyPageView pet={lostPet} />);

  expect(await screen.findByText(`${lostPet.name} is currently missing`)).toBeTruthy();
  expect(screen.getByText("Lost Mode Active")).toBeTruthy();
  unmount();

  render(<QrSafetyPageView pet={{ ...lostPet, lostModeEnabled: false }} />);
  expect(await screen.findByText(`Found ${lostPet.name}?`)).toBeTruthy();
  expect(screen.queryByText("Lost Mode Active")).toBeNull();
});
