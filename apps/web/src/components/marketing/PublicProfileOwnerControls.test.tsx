// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { mockPets } from "@/data/mockPets";
import { getPetProfileTheme } from "@/lib/petProfileThemes";

vi.mock("@/lib/features", () => ({
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: false,
}));

vi.mock("@/components/share/PetShareCard", () => ({
  PetShareCard: () => <button type="button">Share Card</button>,
}));

vi.mock("@/components/qr/QrCodeCard", () => ({
  QrCodeCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/share/ShareProfileLink", () => ({
  ShareProfileLink: ({
    shareAction,
    shareVersion,
  }: {
    shareAction?: ReactNode;
    shareVersion?: string;
  }) => (
    <div data-share-version={shareVersion}>
      {shareAction}
      <button type="button">Copy Link</button>
    </div>
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

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
});

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
    // Owners get the same single share entry point they use in the portal.
    expect(screen.queryByText("Copy Link")).toBeNull();
    const share = screen.getByRole("button", { name: `Share ${profile.name}` });
    expect(share.getAttribute("aria-haspopup")).toBe("dialog");

    fireEvent.click(share);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share Card" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Copy Profile Link/ })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close share options" }));
    expect(screen.queryByRole("dialog")).toBeNull();
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
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the Share Center for a visitor rather than the device share sheet", () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    render(
      <PublicProfileOwnerControls
        ownedPet={null}
        profile={profile}
        theme={theme}
      />
    );

    const shareProfile = screen.getByRole("button", {
      name: `Share ${profile.name}`,
    });
    expect(shareProfile.getAttribute("aria-haspopup")).toBe("dialog");

    fireEvent.click(shareProfile);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Share Card" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Copy Profile Link/ })
    ).toBeTruthy();
  });

  it("keeps owner-only actions out of a visitor's Share Center", () => {
    render(
      <PublicProfileOwnerControls
        ownedPet={null}
        profile={profile}
        theme={theme}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: `Share ${profile.name}` })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /More sharing options/ })
    );

    // The finder-facing Safety Profile belongs to the owner, and editing does
    // not belong to a visitor at all.
    expect(screen.queryByText("Safety Profile")).toBeNull();
    expect(screen.queryByText("Copy Safety Profile Link")).toBeNull();
    expect(screen.queryByText("Back to Edit")).toBeNull();
    expect(screen.getByText("Download Public Profile QR")).toBeTruthy();
  });

  it("returns focus to the Share button a visitor pressed", async () => {
    render(
      <PublicProfileOwnerControls
        ownedPet={null}
        profile={profile}
        theme={theme}
      />
    );

    const shareProfile = screen.getByRole("button", {
      name: `Share ${profile.name}`,
    });
    fireEvent.click(shareProfile);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(shareProfile));
  });
});
