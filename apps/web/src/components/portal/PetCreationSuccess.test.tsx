// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { PetCreationSuccess } from "./PetCreationSuccess";

afterEach(cleanup);

describe("PetCreationSuccess", () => {
  it("shows one Pet Hub primary action and a secondary public-profile link", () => {
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
      screen.getByRole("heading", { name: "Milo is on MyPetLink" })
    ).toBe(document.activeElement);

    const primary = screen.getByRole("link", {
      name: "Go to Milo's page",
    });
    expect(primary.getAttribute("href")).toBe("/pets/created-pet");
    expect(primary.getAttribute("target")).toBeNull();

    const publicProfile = screen.getByRole("link", {
      name: "View public profile",
    });
    expect(publicProfile.getAttribute("href")).toBe("/p/milo-public");
    expect(publicProfile.getAttribute("target")).toBe("_blank");
    expect(publicProfile.getAttribute("rel")).toBe("noopener noreferrer");

    expect(container.querySelectorAll(".bg-pet-teal")).toHaveLength(1);
    expect(screen.queryByText(/First Moment/)).toBeNull();
    expect(
      screen.queryByText(/Profile Completion|Care setup|privacy setup/i)
    ).toBeNull();
  });

  it("keeps the Pet Hub primary action when the public profile is unavailable", () => {
    const pet = {
      ...structuredClone(mockPets[0]),
      id: "private-pet",
      name: "Milo",
    };

    const { container } = render(
      <PetCreationSuccess canViewPublicProfile={false} pet={pet} />
    );

    expect(
      screen.getByRole("link", { name: "Go to Milo's page" }).getAttribute("href")
    ).toBe("/pets/private-pet");
    expect(screen.queryByRole("link", { name: "View public profile" })).toBeNull();
    expect(screen.queryByText(/First Moment/)).toBeNull();
    expect(container.querySelectorAll(".bg-pet-teal")).toHaveLength(1);
  });

  it("shows a distinct accessible post-create warning", () => {
    const warning =
      "Milo was created, but the photo couldn't be uploaded. You can add it again from Edit Pet.";

    render(
      <PetCreationSuccess
        canViewPublicProfile
        pet={structuredClone(mockPets[0])}
        warning={warning}
      />
    );

    expect(screen.getByRole("status").textContent).toBe(warning);
    expect(screen.getByRole("link", { name: "Go to Milo's page" })).toBeTruthy();
  });

  it("uses the pet photo when available and the existing avatar fallback otherwise", () => {
    const photoPet = {
      ...structuredClone(mockPets[0]),
      photoUrl: "data:image/png;base64,photo",
    };
    const firstView = render(
      <PetCreationSuccess canViewPublicProfile pet={photoPet} />
    );

    expect(screen.getByAltText("Pet portrait").getAttribute("src")).toBe(
      photoPet.photoUrl
    );

    firstView.unmount();
    render(
      <PetCreationSuccess
        canViewPublicProfile
        pet={{ ...photoPet, photoUrl: "" }}
      />
    );
    expect(screen.queryByAltText("Pet portrait")).toBeNull();
  });

  it("keeps a long pet name intact in usable escaped copy", () => {
    const longName = "Princess Buttercup the Third of Taman Tun";
    const pet = { ...structuredClone(mockPets[0]), name: longName };

    render(<PetCreationSuccess canViewPublicProfile pet={pet} />);

    expect(
      screen.getByRole("heading", {
        name: `${longName} is on MyPetLink`,
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: `Go to ${longName}'s page` })
    ).toBeTruthy();
  });
});
