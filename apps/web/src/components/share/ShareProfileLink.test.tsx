// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareProfileLink } from "./ShareProfileLink";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
});
