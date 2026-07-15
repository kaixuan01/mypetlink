// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareProfileLink } from "./ShareProfileLink";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ShareProfileLink", () => {
  it("shares the versioned public profile URL rather than the social-card URL", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    render(
      <ShareProfileLink
        path="https://mypetlink.com.my/p/nori-futurepet1234"
        petName="Nori"
        shareVersion="0123456789abcdef"
        showShareButton
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Share Profile" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      title: "Nori's MyPetLink Profile",
      text: "View Nori's pet profile on MyPetLink.",
      url: "https://mypetlink.com.my/p/nori-futurepet1234?share=0123456789abcdef",
    });
    expect(JSON.stringify(share.mock.calls)).not.toContain("/social/pets/");
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
        petName="Topu"
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
  });
});
