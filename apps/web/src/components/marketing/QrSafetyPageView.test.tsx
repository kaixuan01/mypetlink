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
  expect(screen.getByText("Chicken")).toBeTruthy();
  expect(screen.getByText("Penicillin")).toBeTruthy();
  expect(document.body.textContent).not.toContain('["Chicken"');
});

it("never shows the Not set placeholder in the finder pet summary", async () => {
  const pet = {
    ...mockPets[0],
    breed: "Not set",
    color: "Not set",
  };
  render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink safety page");
  expect(document.body.textContent).not.toContain("Not set");
});

it("falls back to the pet colour in the summary when the breed is unknown", async () => {
  const pet = {
    ...mockPets[0],
    breed: "Not set",
    color: "Golden brown",
  };
  render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink safety page");
  expect(document.body.textContent).toContain("Golden brown");
});

it("hides the allergy safety section when none are saved", async () => {
  render(<QrSafetyPageView pet={{ ...mockPets[0], allergies: [] }} />);

  await screen.findByText("MyPetLink safety page");
  expect(screen.queryByText("Known allergies")).toBeNull();
});

it("adds labeled finder details and removes the urgent state when found", async () => {
  const rawTimestamp = "2026-07-16T07:42:00+00:00";
  const lostPet = {
    ...mockPets[0],
    lostModeEnabled: true,
    lostMode: {
      ...mockPets[0].lostMode,
      lastSeenArea: "Ampang, Kuala Lumpur",
      lastSeenDateTime: rawTimestamp,
      lostMessage: "Please help Milo get home safely.",
      rewardNote: "RM50 reward offered",
      extraContactInstruction: "Please call me directly",
    },
  };
  const { unmount } = render(<QrSafetyPageView pet={lostPet} />);

  expect(await screen.findByText(`${lostPet.name} is currently missing`)).toBeTruthy();
  expect(screen.getByText("Lost Mode Active")).toBeTruthy();
  expect(screen.getByText("Please help Milo get home safely.")).toBeTruthy();
  expect(screen.getByText("Last seen area")).toBeTruthy();
  expect(screen.getByText("Last seen")).toBeTruthy();
  expect(screen.getByText("16 Jul 2026, 3:42 PM")).toBeTruthy();
  expect(screen.getByText("Reward")).toBeTruthy();
  expect(screen.getByText("RM50 reward offered")).toBeTruthy();
  expect(screen.getByText("Contact instructions")).toBeTruthy();
  expect(screen.getByText("Please call me directly")).toBeTruthy();
  expect(document.body.textContent).not.toContain(rawTimestamp);
  unmount();

  render(<QrSafetyPageView pet={{ ...lostPet, lostModeEnabled: false }} />);
  expect(await screen.findByText(`Found ${lostPet.name}?`)).toBeTruthy();
  expect(screen.queryByText("Lost Mode Active")).toBeNull();
});
