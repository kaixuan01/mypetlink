// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { mockPets } from "@/data/mockPets";
import { getPetProfileTheme } from "@/lib/petProfileThemes";

vi.mock("@/lib/features", () => ({
  shareCardsEnabled: true,
}));

vi.mock("@/components/share/PetShareCard", () => ({
  PetShareCard: () => <button type="button">Share Card</button>,
}));

vi.mock("@/components/share/ShareProfileLink", () => ({
  ShareProfileLink: ({
    shareVersion,
    showShareButton,
  }: {
    shareVersion?: string;
    showShareButton?: boolean;
  }) => (
    <button data-share-version={shareVersion} type="button">
      {showShareButton ? "Share profile" : "Copy Link"}
    </button>
  ),
}));

vi.mock("@/components/ui/CTAButton", () => ({
  CTAButton: ({
    children,
    href,
  }: {
    children: ReactNode;
    href?: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/ui/Icon", () => ({
  Icon: () => <span aria-hidden="true" />,
}));

const { PublicProfileOwnerControls } = await import(
  "@/components/marketing/PublicProfileOwnerControls"
);

const profile = mockPets[0];
const theme = getPetProfileTheme(profile.profileTheme);

afterEach(cleanup);

describe("PublicProfileOwnerControls", () => {
  it("shows owner management and the correct edit link for the pet owner", () => {
    render(
      <PublicProfileOwnerControls
        ownedPet={mockPets[0]}
        profile={profile}
        theme={theme}
      />
    );

    expect(screen.getByText(/viewing as public/i)).toBeTruthy();
    expect(screen.getByText("Copy Link")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share Card" })).toBeTruthy();
    expect(
      screen.getByText("Copy Link").getAttribute("data-share-version")
    ).toMatch(/^[a-z0-9]+$/);
    expect(
      (screen.getByRole("link", { name: "Back to Edit" }) as HTMLAnchorElement)
        .getAttribute("href")
    ).toBe("/pets/pet_milo/edit");
  });

  it("hides the complete management card when the visitor does not own the pet", () => {
    render(
      <PublicProfileOwnerControls
        ownedPet={null}
        profile={profile}
        theme={theme}
      />
    );

    expect(screen.queryByLabelText("Owner profile management")).toBeNull();
    expect(screen.queryByText(/viewing as public/i)).toBeNull();
    expect(screen.queryByText("Back to Edit")).toBeNull();
    expect(screen.getByText("Share profile")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
  });
});
