// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { PetCard } from "./PetCard";

afterEach(cleanup);

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

it("shows management instead of public actions for a private profile", () => {
  const pet = { ...mockPets[0], publicProfileEnabled: false };
  render(<PetCard pet={pet} tags={[]} orders={[]} />);

  expect(screen.getByText("Private")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Enable Profile" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Public Profile" })).toBeNull();
});
