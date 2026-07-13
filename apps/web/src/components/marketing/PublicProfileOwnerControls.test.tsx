// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { mockPets } from "@/data/mockPets";
import { getPetProfileTheme } from "@/lib/petProfileThemes";

const ownerMocks = vi.hoisted(() => ({
  authenticated: true,
  getOwnedPetByPublicCode: vi.fn(),
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => ownerMocks.authenticated,
}));

vi.mock("@/services/petService", () => ({
  getOwnedPetByPublicCode: ownerMocks.getOwnedPetByPublicCode,
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

beforeEach(() => {
  ownerMocks.authenticated = true;
  ownerMocks.getOwnedPetByPublicCode.mockReset();
});

describe("PublicProfileOwnerControls", () => {
  it("shows owner management and the correct edit link for the pet owner", async () => {
    ownerMocks.getOwnedPetByPublicCode.mockResolvedValue({ data: mockPets[0] });

    render(<PublicProfileOwnerControls profile={profile} theme={theme} />);

    expect(await screen.findByText(/viewing as public/i)).toBeTruthy();
    expect(screen.getByText("Copy Link")).toBeTruthy();
    expect(
      screen.getByText("Copy Link").getAttribute("data-share-version")
    ).toMatch(/^[a-z0-9]+$/);
    expect(
      (screen.getByRole("link", { name: "Back to Edit" }) as HTMLAnchorElement)
        .getAttribute("href")
    ).toBe("/pets/pet_milo/edit");
  });

  it("hides the complete management card for another authenticated user", async () => {
    ownerMocks.getOwnedPetByPublicCode.mockResolvedValue({ data: null });

    render(<PublicProfileOwnerControls profile={profile} theme={theme} />);

    await waitFor(() =>
      expect(ownerMocks.getOwnedPetByPublicCode).toHaveBeenCalledWith("k7q2")
    );
    expect(screen.queryByLabelText("Owner profile management")).toBeNull();
    expect(screen.queryByText(/viewing as public/i)).toBeNull();
    expect(screen.queryByText("Back to Edit")).toBeNull();
    expect(screen.getByText("Share profile")).toBeTruthy();
  });

  it("hides management for a logged-out visitor", () => {
    ownerMocks.authenticated = false;

    render(<PublicProfileOwnerControls profile={profile} theme={theme} />);

    expect(ownerMocks.getOwnedPetByPublicCode).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Owner profile management")).toBeNull();
    expect(screen.queryByText("Back to Edit")).toBeNull();
  });

  it("does not flash management while ownership is loading", async () => {
    let resolveOwnership: (value: { data: null }) => void = () => undefined;
    ownerMocks.getOwnedPetByPublicCode.mockReturnValue(
      new Promise((resolve) => {
        resolveOwnership = resolve;
      })
    );

    render(<PublicProfileOwnerControls profile={profile} theme={theme} />);

    await waitFor(() => expect(ownerMocks.getOwnedPetByPublicCode).toHaveBeenCalled());
    expect(screen.queryByLabelText("Owner profile management")).toBeNull();
    expect(screen.queryByText(/viewing as public/i)).toBeNull();
    expect(screen.queryByText("Back to Edit")).toBeNull();

    resolveOwnership({ data: null });
  });
});
