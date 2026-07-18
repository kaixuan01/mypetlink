// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { PetCard } from "./PetCard";

afterEach(cleanup);

it("keeps one Public Profile action on the pet card", () => {
  const pet = mockPets[0];
  render(<PetCard pet={pet} />);

  const publicProfile = screen.getByRole("link", { name: "Public Profile" });
  expect(publicProfile.getAttribute("href")).toBe(pet.publicProfilePath);
  expect(publicProfile.getAttribute("target")).toBe("_blank");

  fireEvent.click(screen.getByRole("button", { name: "More actions" }));

  expect(screen.queryByRole("link", { name: "View public profile" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "View Safety Profile" }).getAttribute("href")
  ).toBe(pet.qrSafetyPath);
});

it("shows Safety Profile status independently from Smart Tag linkage", () => {
  // Visible contact and no linked tag: the profile is active while the tag
  // line reports no linkage. Neither state may leak into the other.
  render(<PetCard pet={mockPets[0]} tags={[]} orders={[]} />);

  expect(screen.getByText("Safety Profile Active")).toBeTruthy();
  expect(screen.getByText("No Smart Tag Linked")).toBeTruthy();
  expect(screen.queryByText("QR Safety Active")).toBeNull();
});

it("shows Contact Update Needed when no visible usable contact exists", () => {
  // The pet uses its own contact details, and they are empty — the owner's
  // account-level numbers must not mask the missing pet contact.
  const pet = {
    ...mockPets[0],
    owner: { ...mockPets[0].owner, phone: "", whatsapp: "" },
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: "",
      whatsappNumber: "",
    },
  };
  render(<PetCard pet={pet} tags={[]} orders={[]} />);

  expect(screen.getByText("Contact Update Needed")).toBeTruthy();
});

it("shows Safety Profile Off when the owner disabled public access", () => {
  const pet = { ...mockPets[0], qrSafetyEnabled: false };
  render(<PetCard pet={pet} tags={[]} orders={[]} />);

  expect(screen.getByText("Safety Profile Off")).toBeTruthy();
});
