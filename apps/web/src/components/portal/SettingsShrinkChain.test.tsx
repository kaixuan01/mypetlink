// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerSocialProfile } from "@/services/ownerSocialService";
import type { PetSocialSettings } from "@/services/petSocialSettingsService";

/**
 * The Settings cards must be able to shrink.
 *
 * **This does not measure layout.** jsdom has no CSS box model — every
 * `getBoundingClientRect()` here would return zeroes — so nothing in this file
 * can prove a pixel. The rendered measurements live in
 * `docs/operations/settings-responsive-verification.md`.
 *
 * What it *can* prove is the structural cause, which is what actually broke:
 *
 * A flex or grid item defaults to `min-width: auto`, so it refuses to shrink
 * below its content's min-content width. Two things in this card have a
 * min-content far wider than a phone:
 *
 *   - a visible `<input type="file">`, whose user-agent intrinsic width covers
 *     "Choose file / No file chosen" plus the `file:` button; and
 *   - anything with `truncate`, because that sets `white-space: nowrap` and so
 *     makes the min-content the entire unwrapped string.
 *
 * If any ancestor between one of those and the card lacks `min-w-0`, that floor
 * propagates all the way up and the card stops fitting. That is exactly what
 * pushed the Social settings card ~54px past a 375px viewport, where the app
 * shell's `overflow-x-hidden` clipped it instead of revealing it.
 *
 * So these walk the real rendered tree from each hazard up to the card and
 * assert the chain stays shrinkable — which a static "does this one element
 * have this one class" check would not catch when the break is an ancestor.
 */

const mocks = vi.hoisted(() => ({
  getOwnerSocialProfile: vi.fn(),
  updateOwnerSocialProfile: vi.fn(),
  claimOwnerHandle: vi.fn(),
  checkOwnerHandleAvailability: vi.fn(),
  uploadMediaFile: vi.fn(),
  isApiConfigured: vi.fn(() => true),
  getPetSocialSettings: vi.fn(),
  updatePetSocialSettings: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => mocks.isApiConfigured(),
  canUseApi: () => mocks.isApiConfigured(),
}));
vi.mock("@/services/mediaService", () => ({
  uploadMediaFile: (...args: unknown[]) => mocks.uploadMediaFile(...args),
}));
vi.mock("@/services/ownerSocialService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/ownerSocialService")
  >("@/services/ownerSocialService");

  return {
    ...actual,
    getOwnerSocialProfile: (...args: unknown[]) => mocks.getOwnerSocialProfile(...args),
    updateOwnerSocialProfile: (...args: unknown[]) =>
      mocks.updateOwnerSocialProfile(...args),
    claimOwnerHandle: (...args: unknown[]) => mocks.claimOwnerHandle(...args),
    checkOwnerHandleAvailability: (...args: unknown[]) =>
      mocks.checkOwnerHandleAvailability(...args),
  };
});
vi.mock("@/services/petSocialSettingsService", () => ({
  getPetSocialSettings: (...args: unknown[]) => mocks.getPetSocialSettings(...args),
  updatePetSocialSettings: (...args: unknown[]) =>
    mocks.updatePetSocialSettings(...args),
}));

import { PetSocialSettingsList } from "@/components/portal/PetSocialSettingsList";
import { SocialProfileSettings } from "@/components/portal/SocialProfileSettings";

const profile: OwnerSocialProfile = {
  handle: "tanfamily",
  displayName: "The Tan Family",
  bio: "",
  avatarMediaId: "",
  avatarUrl: "",
  avatarThumbnailUrl: "",
  generalArea: "",
  isSocialEnabled: true,
  isDiscoverable: false,
  allowFollowers: true,
  canEnableSocial: true,
  missingRequirements: [],
  handleChangeAvailableAt: "",
  rowVersion: "v1",
};

function pet(overrides: Partial<PetSocialSettings> = {}): PetSocialSettings {
  return {
    petId: "pet-1",
    name: "Mochi",
    photoUrl: "",
    photoThumbnailUrl: "",
    isSocialEnabled: true,
    isDiscoverable: false,
    canEnableSocial: true,
    missingRequirements: [],
    rowVersion: "v1",
    ...overrides,
  };
}

/** Does this element participate in a layout where min-width:auto blocks shrinking? */
function isFlexOrGridItem(el: HTMLElement) {
  const parent = el.parentElement;
  if (!parent) return false;
  const cls = parent.className?.toString() ?? "";
  return /(^|\s)(flex|inline-flex|grid|inline-grid)(\s|$)/.test(cls);
}

function canShrink(el: HTMLElement) {
  const cls = el.className?.toString() ?? "";
  // min-w-0 is the direct fix; a basis-* with flex-1 also gives the item a
  // definite starting size rather than its content's.
  return /(^|\s)min-w-0(\s|$)/.test(cls);
}

/**
 * Walks from `start` up to `stop`, returning any flex/grid item on the way that
 * cannot shrink below its content.
 */
function unshrinkableAncestors(start: HTMLElement, stop: HTMLElement) {
  const blocked: string[] = [];
  let el: HTMLElement | null = start;

  while (el && el !== stop) {
    if (isFlexOrGridItem(el) && !canShrink(el)) {
      blocked.push(`<${el.tagName.toLowerCase()} class="${el.className}">`);
    }
    el = el.parentElement;
  }

  return blocked;
}

beforeEach(() => {
  mocks.getOwnerSocialProfile.mockResolvedValue({
    data: profile,
    meta: { requestId: "t", source: "api" as const },
  });
  mocks.getPetSocialSettings.mockResolvedValue({
    data: { ownerSocialEnabled: true, pets: [pet()] },
    meta: { requestId: "t", source: "api" as const },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings cards can shrink to a phone", () => {
  it("keeps the avatar file input on a shrinkable chain", async () => {
    render(<SocialProfileSettings />);

    const input = (await screen.findByLabelText(/profile picture/i, {
      selector: 'input[type="file"]',
    }).catch(() => null)) as HTMLInputElement | null;

    const fileInput =
      input ??
      (document.querySelector('input[type="file"]') as HTMLInputElement | null);

    expect(fileInput, "the avatar file input should be rendered").toBeTruthy();

    const card = document.querySelector("section") as HTMLElement;
    expect(card).toBeTruthy();

    // Two ways to stop a file input asserting its user-agent intrinsic width.
    // Either it takes the width it is given, or it is out of the visual layer
    // entirely behind a styled button — which is what it does now, and which
    // also removes the browser-chrome look from a profile screen.
    const inputClass = fileInput!.className;
    const isVisuallyHidden = /(^|\s)sr-only(\s|$)/.test(inputClass);

    if (!isVisuallyHidden) {
      expect(inputClass).toMatch(/(^|\s)w-full(\s|$)/);
      expect(inputClass).toMatch(/(^|\s)min-w-0(\s|$)/);
    }

    // The visible control that replaced it still has to sit on a chain that
    // can shrink.
    const button = screen.getByTestId("social-avatar-button");
    expect(unshrinkableAncestors(button, card)).toEqual([]);
  });

  it("keeps every truncating label on a shrinkable chain", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = await screen.findByTestId("pet-social-row");
    const truncating = [...row.querySelectorAll<HTMLElement>(".truncate")];

    // truncate means white-space: nowrap, so an un-shrinkable ancestor turns the
    // pet's name into the card's minimum width.
    expect(truncating.length).toBeGreaterThan(0);

    for (const el of truncating) {
      expect(
        unshrinkableAncestors(el, row),
        `A truncating element sits under an ancestor that cannot shrink, so a ` +
          `long pet name will widen the whole Settings card instead of ` +
          `ellipsising.`
      ).toEqual([]);
    }
  });

  it("keeps a long pet name from widening the card", async () => {
    mocks.getPetSocialSettings.mockResolvedValue({
      data: {
        ownerSocialEnabled: true,
        pets: [pet({ name: "Bartholomew Wigglesworth Fluffington the Third" })],
      },
      meta: { requestId: "t", source: "api" as const },
    });

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = await screen.findByTestId("pet-social-row");
    const name = row.querySelector<HTMLElement>(".truncate");

    expect(name?.textContent).toContain("Bartholomew");
    expect(row.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(unshrinkableAncestors(name!, row)).toEqual([]);
  });

  it("does not let the pet rows sit in a fixed multi-column grid", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    const list = await screen.findByTestId("pet-social-list");
    const row = await screen.findByTestId("pet-social-row");

    // A fixed column count is the other way a card stops fitting a phone.
    expect(list.className).not.toMatch(/grid-cols-[2-9]/);
    expect(row.className).not.toMatch(/grid-cols-[2-9]/);
  });

  it("never reintroduces a fixed width on the settings controls", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    const list = await screen.findByTestId("pet-social-list");

    for (const el of list.querySelectorAll<HTMLElement>("*")) {
      const cls = el.className?.toString() ?? "";
      // w-16/h-16 style fixed sizes are fine on the avatar; a min-width in
      // absolute units is what pins a card open.
      expect(
        cls,
        `A hard min-width on ${el.tagName} would pin the card open on a phone.`
      ).not.toMatch(/min-w-\[\d{3,}px\]/);
    }
  });
});
