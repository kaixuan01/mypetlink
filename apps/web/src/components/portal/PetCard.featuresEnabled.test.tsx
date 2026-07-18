// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

vi.mock("@/lib/features", () => ({
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: true,
  smartTagOrderingEnabled: true,
  smartTagsEnabled: true,
  tagOrdersEnabled: true,
}));

const { PetCard } = await import("./PetCard");

afterEach(cleanup);

it("restores Safety Profile and Smart Tag owner UI when features are enabled", () => {
  const pet = mockPets[0];
  render(<PetCard pet={pet} tags={[]} orders={[]} />);

  expect(screen.getByText("Safety Profile Active")).toBeTruthy();
  expect(screen.getByText("No Smart Tag Linked")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  expect(
    screen.getByRole("link", { name: "View Safety Profile" }).getAttribute("href")
  ).toBe(pet.qrSafetyPath);
  expect(screen.getByRole("link", { name: "Smart tags" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Order tag" })).toBeTruthy();
});

it("keeps Safety Profile status semantics when the feature returns", () => {
  const pet = {
    ...mockPets[0],
    owner: { ...mockPets[0].owner, phone: "", whatsapp: "" },
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: "",
      whatsappNumber: "",
    },
  };
  const { rerender } = render(<PetCard pet={pet} tags={[]} orders={[]} />);

  expect(screen.getByText("Contact Update Needed")).toBeTruthy();

  rerender(
    <PetCard
      pet={{ ...mockPets[0], qrSafetyEnabled: false }}
      tags={[]}
      orders={[]}
    />
  );
  expect(screen.getByText("Safety Profile Off")).toBeTruthy();
});
