// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: true,
  writeText: vi.fn(),
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

function petFixture(overrides: Partial<Pet> = {}): Pet {
  return { ...structuredClone(mockPets[0]), ...overrides };
}

function shareCardVariants() {
  return screen
    .getByText("Share Pet Card")
    .closest("button")
    ?.getAttribute("data-variants");
}

function openCenter(pet: Pet) {
  render(<ShareCenter pet={pet} />);
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

  it("always offers the profile card, and the occasion cards only on the day", () => {
    // 17 Aug 2026, 10:00 in Malaysia — the calendar day occasions are keyed to.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T02:00:00Z"));

    try {
      const noOccasions = petFixture({ birthday: "2021-04-02", adoptionDay: "" });
      render(<ShareCenter pet={noOccasions} />);
      fireEvent.click(
        screen.getByRole("button", { name: `Share ${noOccasions.name}` })
      );
      expect(shareCardVariants()).toBe("profile");

      cleanup();

      const withOccasions = petFixture({
        birthday: "2021-08-17",
        adoptionDay: "2022-08-17",
      });
      render(<ShareCenter pet={withOccasions} />);
      fireEvent.click(
        screen.getByRole("button", { name: `Share ${withOccasions.name}` })
      );
      expect(shareCardVariants()).toBe("profile,birthday,adoption");
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
