// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("@/lib/analytics", () => ({
  AnalyticsEvent: {
    ShareClicked: "share_clicked",
    ShareLinkCopied: "share_link_copied",
  },
  trackEvent: (...args: unknown[]) => analytics.trackEvent(...args),
}));

const { ShareProfileLink } = await import("./ShareProfileLink");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  analytics.trackEvent.mockReset();
});

describe("ShareProfileLink", () => {
  it("never reaches the device share sheet itself", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    render(
      <ShareProfileLink
        path="https://mypetlink.com.my/p/nori-futurepet1234"
        shareVersion="0123456789abcdef"
        shareAction={<button type="button">Share profile</button>}
      />
    );

    // Sharing belongs to the Share Center; this component only shows and
    // copies the address, whatever button the surface puts beside it.
    fireEvent.click(screen.getByRole("button", { name: "Share profile" }));
    await waitFor(() => expect(share).not.toHaveBeenCalled());
  });

  it("displays and copies one complete, safely wrapped versioned URL", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      ...window.navigator,
      clipboard: { writeText },
    });

    render(
      <ShareProfileLink
        copyButtonFullWidth
        path="https://mypetlink.com.my/p/topu-pnpr4ipnr6ppelnsn"
        shareVersion="sharetoken123"
      />
    );

    const completeUrl =
      "https://mypetlink.com.my/p/topu-pnpr4ipnr6ppelnsn?share=sharetoken123";
    const displayedUrl = screen.getByRole("textbox", {
      name: "Share profile link",
    });
    const copyButton = screen.getByRole("button", { name: "Copy Link" });

    expect(displayedUrl.textContent).toBe(completeUrl);
    expect(displayedUrl.classList.contains("truncate")).toBe(false);
    expect(displayedUrl.classList.contains("[overflow-wrap:anywhere]")).toBe(
      true
    );
    expect(copyButton.classList.contains("w-full")).toBe(true);
    expect(copyButton.classList.contains("sm:w-auto")).toBe(false);
    expect(screen.getAllByRole("button", { name: "Copy Link" })).toHaveLength(1);

    fireEvent.click(copyButton);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(completeUrl));
    expect(analytics.trackEvent).toHaveBeenCalledWith("share_link_copied", {
      surface: "owner_portal",
    });
  });
});
