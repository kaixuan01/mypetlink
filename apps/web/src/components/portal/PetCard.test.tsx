// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getPetLifecycleConfirmation } from "@/lib/petLifecycleActions";
import type { Pet } from "@/types";
import { PetCard } from "./PetCard";

afterEach(cleanup);

function pet(status: Pet["lifecycleStatus"]): Pet {
  return {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: status,
    previousLifecycleStatus: status === "Memorial" ? "Memorial" : "Active",
  };
}

it("keeps one accessible Public Profile action on the pet card", () => {
  const pet = mockPets[0];
  render(<PetCard pet={pet} />);

  const publicProfile = screen.getByRole("link", { name: "Public Profile" });
  expect(publicProfile.getAttribute("href")).toBe(pet.publicProfilePath);
  expect(publicProfile.getAttribute("target")).toBe("_blank");

  fireEvent.click(screen.getByRole("button", { name: "More actions" }));

  expect(screen.queryByRole("link", { name: "View public profile" })).toBeNull();
  expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Smart tags" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Order tag" })).toBeNull();
});

it("hides Safety Profile and Smart Tag status while their owner UI is disabled", () => {
  render(<PetCard pet={mockPets[0]} tags={[]} orders={[]} />);

  expect(screen.queryByText("Safety Profile Active")).toBeNull();
  expect(screen.queryByText("No Smart Tag Linked")).toBeNull();
});

it("uses real list content and never presents emergency instructions as the card bio", () => {
  const pet = {
    ...mockPets[0],
    bio: "Enjoys quiet walks and sunny naps.",
    emergencyNote: "Keep calm and contact the owner first.",
  };
  const { rerender } = render(<PetCard pet={pet} />);

  expect(screen.getByText(pet.bio).classList.contains("line-clamp-2")).toBe(true);
  expect(screen.queryByText(pet.emergencyNote)).toBeNull();

  rerender(
    <PetCard
      pet={{ ...pet, bio: "", personalityTags: ["Gentle", "Curious"] }}
    />
  );
  expect(screen.getByText("Gentle · Curious")).toBeTruthy();
  expect(screen.queryByText(pet.emergencyNote)).toBeNull();
});

it("shows management instead of public actions for a private profile", () => {
  const pet = { ...mockPets[0], publicProfileEnabled: false };
  render(<PetCard pet={pet} tags={[]} orders={[]} />);

  expect(screen.getByText("Private")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Enable Profile" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Public Profile" })).toBeNull();
});

it("uses the Archived badge for state and keeps retention copy fully visible", () => {
  const archived = pet("Archived");
  render(<PetCard pet={archived} />);

  expect(screen.getByText("Archived")).toBeTruthy();
  const retention = screen.getByText("Memories and records stay saved.");
  expect(retention.classList.contains("line-clamp-2")).toBe(false);
  expect(screen.queryByText(/This profile is archived/i)).toBeNull();
  expect(screen.queryByText("Archived Profile")).toBeNull();

  // T12 is deliberately unchanged: the existing action remains available.
  expect(screen.getByRole("link", { name: "Enable Profile" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.getByRole("button", { name: "Restore to List" })).toBeTruthy();
});

it("allows realistic pet metadata two lines without changing its content", () => {
  const longBreedPet = {
    ...mockPets[0],
    breed: "Labrador Retriever and Golden Retriever Mix",
  };
  render(<PetCard pet={longBreedPet} />);

  const metadata = screen.getByText(getPetSummaryLabel(longBreedPet));
  expect(metadata.textContent).toBe(getPetSummaryLabel(longBreedPet));
  expect(metadata.classList.contains("line-clamp-2")).toBe(true);
  expect(metadata.classList.contains("truncate")).toBe(false);
});

it.each([
  ["Active", ["Move to Memorial", "Archive Pet"], "Restore to List"],
  ["Memorial", ["Restore to Active", "Archive Pet"], "Move to Memorial"],
  ["Archived", ["Restore to List"], "Archive Pet"],
] as const)(
  "offers only valid lifecycle shortcuts for %s pets",
  (status, expected, absent) => {
    render(<PetCard pet={pet(status)} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    for (const label of expected) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: absent })).toBeNull();
  }
);

it("uses the shared lifecycle confirmation copy", () => {
  const active = pet("Active");
  const copy = getPetLifecycleConfirmation("memorial", active.name);
  render(<PetCard pet={active} />);

  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Move to Memorial" }));

  expect(screen.getByText(copy.title)).toBeTruthy();
  expect(screen.getByText(copy.message)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: copy.confirmLabel })
  ).toBeTruthy();
});
