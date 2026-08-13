// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { PetCreationSuccess } from "./PetCreationSuccess";

afterEach(cleanup);

describe("PetCreationSuccess", () => {
  it("makes the Public Share Profile the single primary action", () => {
    const pet = {
      ...structuredClone(mockPets[0]),
      id: "created-pet",
      name: "Milo",
      publicProfilePath: "/p/milo-public",
    };

    const { container } = render(
      <PetCreationSuccess canViewPublicProfile pet={pet} />
    );

    expect(
      screen.getByRole("heading", { name: "Milo's profile is ready!" })
    ).toBe(document.activeElement);

    const primary = screen.getByRole("link", { name: "View Milo's Profile" });
    expect(primary.getAttribute("href")).toBe("/p/milo-public");
    expect(primary.getAttribute("target")).toBe("_blank");
    expect(primary.getAttribute("rel")).toBe("noopener noreferrer");

    const secondary = screen.getByRole("link", {
      name: "Add Milo's First Moment",
    });
    expect(secondary.getAttribute("href")).toBe(
      "/pets/created-pet/moments/new"
    );
    expect(container.querySelectorAll(".bg-pet-teal")).toHaveLength(1);
    expect(screen.queryByText(/Safety Profile|Order Physical Tag|Dashboard/)).toBeNull();
  });

  it("uses Add First Moment as the primary fallback when the public profile is off", () => {
    const pet = {
      ...structuredClone(mockPets[0]),
      id: "private-pet",
      name: "Milo",
    };

    const { container } = render(
      <PetCreationSuccess canViewPublicProfile={false} pet={pet} />
    );

    expect(
      screen.getByRole("link", { name: "Add Milo's First Moment" }).getAttribute("href")
    ).toBe("/pets/private-pet/moments/new");
    expect(
      screen.getByRole("link", { name: "Manage Milo" }).getAttribute("href")
    ).toBe("/pets/private-pet");
    expect(container.querySelectorAll(".bg-pet-teal")).toHaveLength(1);
  });

  it("keeps a long pet name intact in usable escaped copy", () => {
    const longName = "Princess Buttercup the Third of Taman Tun";
    const pet = { ...structuredClone(mockPets[0]), name: longName };

    render(<PetCreationSuccess canViewPublicProfile pet={pet} />);

    expect(
      screen.getByRole("heading", {
        name: `${longName}'s profile is ready!`,
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: `View ${longName}'s Profile` })
    ).toBeTruthy();
  });
});
