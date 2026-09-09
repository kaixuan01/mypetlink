// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: true,
  writeText: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  AnalyticsEvent: {
    ShareClicked: "share_clicked",
    ShareLinkCopied: "share_link_copied",
  },
  trackEvent: (...args: unknown[]) => mocks.trackEvent(...args),
}));

vi.mock("@/lib/features", () => ({
  get publicProfilesEnabled() {
    return mocks.publicProfilesEnabled;
  },
  get safetyProfilesOwnerUiEnabled() {
    return mocks.safetyProfilesOwnerUiEnabled;
  },
}));

// The share card and QR panels have their own suites; here we only care that
// the Share Center hands them the right pet and destination.
vi.mock("@/components/share/PetShareCard", () => ({
  PetShareCard: ({
    triggerLabel,
    variants,
  }: {
    triggerLabel?: React.ReactNode;
    variants: { variant: string }[];
  }) => (
    <button data-variants={variants.map((v) => v.variant).join(",")} type="button">
      {triggerLabel}
    </button>
  ),
}));

vi.mock("@/components/qr/QrCodeCard", () => ({
  QrCodeCard: ({ targetPath, title }: { targetPath: string; title: string }) => (
    <div data-target={targetPath}>{title}</div>
  ),
}));

const { ShareCenter } = await import("./ShareCenter");
const { toOwnerPetShareTarget } = await import("@/lib/petShareTarget");

function petFixture(overrides: Partial<Pet> = {}): Pet {
  return { ...structuredClone(mockPets[0]), ...overrides };
}

function stubNativeShare(share: unknown) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
}

function shareCardVariants() {
  return screen
    .getByText("Share Pet Card")
    .closest("button")
    ?.getAttribute("data-variants");
}

function openCenter(pet: Pet) {
  render(<ShareCenter target={toOwnerPetShareTarget(pet)} />);
  fireEvent.click(screen.getByRole("button", { name: `Share ${pet.name}` }));
}

beforeEach(() => {
  mocks.publicProfilesEnabled = true;
  mocks.safetyProfilesOwnerUiEnabled = true;
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
  // Most browsers a test stands in for have no share sheet; the tests that
  // need one opt in.
  stubNativeShare(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  stubNativeShare(undefined);
});

describe("ShareCenter", () => {
  it("opens one dialog with a short first level of choices", () => {
    const pet = petFixture();
    openCenter(pet);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: `Share ${pet.name}` })).toBeTruthy();

    expect(screen.getByText("Share Pet Card")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy Profile Link/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Show Profile QR/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /More sharing options/ })
    ).toBeTruthy();

    // Everything rarer stays one level down.
    expect(screen.queryByText("Download Public Profile QR")).toBeNull();
    expect(screen.queryByText("Copy Safety Profile Link")).toBeNull();
  });

  it("always offers the profile card, and a birthday card only on the day", () => {
    // 17 Aug 2026, 10:00 in Malaysia — the calendar day occasions are keyed to.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T02:00:00Z"));

    try {
      const noOccasions = petFixture({ birthday: "2021-04-02", adoptionDay: "" });
      render(<ShareCenter target={toOwnerPetShareTarget(noOccasions)} />);
      fireEvent.click(
        screen.getByRole("button", { name: `Share ${noOccasions.name}` })
      );
      expect(shareCardVariants()).toBe("profile");

      cleanup();

      const withOccasions = petFixture({
        birthday: "2021-08-17",
        adoptionDay: "2022-08-17",
      });
      render(<ShareCenter target={toOwnerPetShareTarget(withOccasions)} />);
      fireEvent.click(
        screen.getByRole("button", { name: `Share ${withOccasions.name}` })
      );
      expect(shareCardVariants()).toBe("profile,birthday");
    } finally {
      vi.useRealTimers();
    }
  });

  it("copies the public profile link and confirms it", async () => {
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /Copy Profile Link/ }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
    expect(mocks.writeText.mock.calls[0][0]).toContain(pet.publicProfilePath);
    expect(
      await screen.findByText(`${pet.name}'s profile link copied.`)
    ).toBeTruthy();
  });

  it("shows the public profile QR, and a distinct safety QR under More", () => {
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /Show Profile QR/ }));
    const publicQr = screen.getByText(`${pet.name}'s Public Profile`);
    expect(publicQr.getAttribute("data-target")).toBe(pet.publicProfilePath);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));
    fireEvent.click(screen.getByRole("button", { name: /Show Safety QR/ }));

    const safetyQr = screen.getByText(`${pet.name}'s Safety Profile`);
    expect(safetyQr.getAttribute("data-target")).toBe(pet.qrSafetyPath);
    expect(pet.qrSafetyPath).not.toBe(pet.publicProfilePath);
  });

  it("keeps the finder-facing Safety Profile behind More sharing options", () => {
    const pet = petFixture();
    openCenter(pet);

    expect(screen.queryByText("Copy Safety Profile Link")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));

    expect(screen.getByText("Safety Profile")).toBeTruthy();
    expect(screen.getByText(`For someone who finds ${pet.name}.`)).toBeTruthy();
    expect(screen.getByText("Copy Safety Profile Link")).toBeTruthy();
    expect(screen.getByText("Download Public Profile QR")).toBeTruthy();
  });

  it("hides the Safety Profile options while that experience is off", () => {
    mocks.safetyProfilesOwnerUiEnabled = false;
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));

    expect(screen.queryByText("Copy Safety Profile Link")).toBeNull();
    expect(screen.getByText("Download Public Profile QR")).toBeTruthy();
  });

  it("explains when there is nothing public to share yet", () => {
    const pet = petFixture({ publicProfileEnabled: false });
    openCenter(pet);

    expect(
      screen.getByText(
        `${pet.name}'s public profile is switched off, so there is nothing to share yet.`
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Copy Profile Link/ })).toBeNull();
  });

  it("never opens the device share sheet straight from the Share button", () => {
    const share = vi.fn(async () => undefined);
    stubNativeShare(share);
    const pet = petFixture();
    openCenter(pet);

    // The dialog is the whole point: nothing may reach the phone's share
    // sheet before the visitor has chosen how they want to share.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Share with another app/ })
    ).toBeNull();
  });

  it("hands the device share sheet the canonical profile link", async () => {
    const share = vi.fn(async () => undefined);
    stubNativeShare(share);
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Share with another app/ })
    );

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      title: `Meet ${pet.name} | MyPetLink`,
      text: `View ${pet.name}'s public profile, memories, and important safety information.`,
      url: expect.stringContaining(pet.publicProfilePath),
    });
    // The shareable profile address, never the social preview image.
    expect(JSON.stringify(share.mock.calls)).not.toContain("/social/pets/");
    expect(await screen.findByText("Sharing options opened.")).toBeTruthy();
  });

  it("says nothing when the share sheet is dismissed", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    stubNativeShare(share);
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Share with another app/ })
    );

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(mocks.writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("Sharing options opened.")).toBeNull();
  });

  it("copies the link instead when the share sheet refuses to open", async () => {
    const share = vi.fn(async () => {
      throw new Error("no share target");
    });
    stubNativeShare(share);
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Share with another app/ })
    );

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        "Sharing options could not open, so the profile link was copied instead."
      )
    ).toBeTruthy();
  });

  it("stays fully usable on a browser with no share sheet", async () => {
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));
    expect(
      screen.queryByRole("button", { name: /Share with another app/ })
    ).toBeNull();
    expect(screen.getByText("Download Public Profile QR")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /Copy Profile Link/ }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(`${pet.name}'s profile link copied.`)
    ).toBeTruthy();
  });

  it("reports sharing at its outcome, not when the dialog opens", async () => {
    const share = vi.fn(async () => undefined);
    stubNativeShare(share);
    const pet = petFixture();
    openCenter(pet);

    // Opening the dialog is choosing how to share, not sharing.
    expect(mocks.trackEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Share with another app/ })
    );

    await waitFor(() =>
      expect(mocks.trackEvent).toHaveBeenCalledWith("share_clicked", {
        surface: "owner_portal",
      })
    );
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
  });

  it("records nothing when the share sheet is dismissed", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    stubNativeShare(share);
    openCenter(petFixture());

    fireEvent.click(screen.getByRole("button", { name: /More sharing options/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Share with another app/ })
    );

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("records a copied link, on its own and as the share fallback", async () => {
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /Copy Profile Link/ }));

    await waitFor(() =>
      expect(mocks.trackEvent).toHaveBeenCalledWith("share_link_copied", {
        surface: "owner_portal",
      })
    );
    // A browser with no share sheet still reports distribution through the
    // clipboard, exactly as it did before the Share Center existed.
    expect(mocks.trackEvent).not.toHaveBeenCalledWith(
      "share_clicked",
      expect.anything()
    );
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    const pet = petFixture();
    openCenter(pet);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: `Share ${pet.name}` })
      )
    );
  });

  it("reopens on the first level after a deeper panel was left open", () => {
    const pet = petFixture();
    openCenter(pet);

    fireEvent.click(screen.getByRole("button", { name: /Show Profile QR/ }));
    expect(screen.getByText(`${pet.name}'s Public Profile`)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close share options" }));
    fireEvent.click(screen.getByRole("button", { name: `Share ${pet.name}` }));

    expect(screen.getByText("Share Pet Card")).toBeTruthy();
    expect(screen.queryByText(`${pet.name}'s Public Profile`)).toBeNull();
  });
});
