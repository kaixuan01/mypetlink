// @vitest-environment jsdom

/**
 * One user Share tap must produce exactly one native share attempt.
 *
 * WhatsApp was observed presenting a Share Card as an image plus a separate
 * text message, which looks like the app sharing twice. It is not: the app
 * makes a single navigator.share call carrying the file and the caption, and
 * the receiving app decides how to present them. These tests pin the single
 * call and the payload so that stays true.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  share: vi.fn(),
  canShare: vi.fn(),
  writeText: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    ...actual,
    trackEvent: (...args: unknown[]) => mocks.trackEvent(...args),
  };
});

const { PetShareCard } = await import("./PetShareCard");

const PET = "Linko";
const PROFILE_PATH = "/p/linko-abc123";
const IMAGE_PATH = "/social/pets/linko-abc123.jpg";

function renderCard() {
  render(
    <PetShareCard
      imagePath={IMAGE_PATH}
      petName={PET}
      profilePath={PROFILE_PATH}
      shareVersion="v1"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /Share Card/i }));
}

async function shareTheCard() {
  const share = await screen.findByRole("button", { name: /^Share$/ });
  fireEvent.click(share);
}

function stubJpegFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null) },
      blob: async () => new Blob(["card"], { type: "image/jpeg" }),
    }))
  );
}

function withNativeShare({ files }: { files: boolean }) {
  mocks.canShare.mockReturnValue(files);
  Object.defineProperty(navigator, "share", {
    configurable: true,
    writable: true,
    value: mocks.share,
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    writable: true,
    value: mocks.canShare,
  });
}

function withoutNativeShare() {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
}

beforeEach(() => {
  stubJpegFetch();
  mocks.share.mockResolvedValue(undefined);
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: mocks.createObjectURL.mockReturnValue("blob:card"),
    revokeObjectURL: mocks.revokeObjectURL,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  withoutNativeShare();
});

describe("Share Pet Card native sharing", () => {
  it("makes exactly one native share call carrying the card and the caption", async () => {
    withNativeShare({ files: true });
    renderCard();
    await shareTheCard();

    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1));

    const payload = mocks.share.mock.calls[0][0];
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].type).toBe("image/jpeg");
    expect(payload.text).toContain(`Meet ${PET} on MyPetLink`);
    expect(payload.text).toContain(PROFILE_PATH);
    expect(payload.title).toContain(PET);
  });

  it("does not send the old system-heavy description", async () => {
    withNativeShare({ files: true });
    renderCard();
    await shareTheCard();

    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1));
    expect(mocks.share.mock.calls[0][0].text).not.toContain(
      "memories, and important safety information"
    );
  });

  it("never opens a second share sheet from one tap", async () => {
    withNativeShare({ files: true });
    renderCard();
    await shareTheCard();

    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1));
    // Give any stray follow-up call a chance to appear.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.share).toHaveBeenCalledTimes(1);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it("shares the profile link when the target cannot take files", async () => {
    withNativeShare({ files: false });
    renderCard();
    await shareTheCard();

    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1));
    const payload = mocks.share.mock.calls[0][0];
    expect(payload.files).toBeUndefined();
    expect(payload.url).toContain(PROFILE_PATH);
    expect(payload.text).toContain(`Meet ${PET} on MyPetLink`);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it("stays silent and does nothing else when the owner cancels", async () => {
    withNativeShare({ files: true });
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    mocks.share.mockRejectedValue(abort);

    renderCard();
    await shareTheCard();

    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1));
    expect(mocks.writeText).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    // Cancelling is not an error, so the owner is told nothing.
    expect(screen.queryByText(/could not open/i)).toBeNull();
    expect(screen.queryByText(/copied/i)).toBeNull();
  });

  it("falls back to copying the link when sharing fails, never to a download", async () => {
    withNativeShare({ files: true });
    mocks.share.mockRejectedValue(new Error("share unavailable"));

    renderCard();
    await shareTheCard();

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
    expect(mocks.share).toHaveBeenCalledTimes(1);
    expect(mocks.writeText.mock.calls[0][0]).toContain(PROFILE_PATH);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it("copies the profile link when the browser has no Web Share at all", async () => {
    withoutNativeShare();
    renderCard();

    // With no native share the primary action is not offered; the owner uses
    // the explicit link action instead.
    expect(screen.queryByRole("button", { name: /^Share$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Copy profile link/i }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports one share event per share, with no pet identity attached", async () => {
    withNativeShare({ files: true });
    renderCard();
    await shareTheCard();

    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1));

    const shared = mocks.trackEvent.mock.calls.filter(
      ([event]) => event === "share_card_shared"
    );
    expect(shared).toHaveLength(1);
    const payload = JSON.stringify(shared[0][1] ?? {});
    expect(payload).not.toContain(PET);
    expect(payload).not.toContain(PROFILE_PATH);
  });
});
