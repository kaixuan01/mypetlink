// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentShareButton } from "@/components/social/MomentShareButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("Moment sharing", () => {
  it("shares the public Community Moment URL through the device sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    render(<MomentShareButton momentId="moment-one" title="Beach day" />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Beach day",
        url: `${window.location.origin}/moments/moment-one`,
      })
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("copies the same Community URL when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<MomentShareButton momentId="moment-one" title="Beach day" />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/moments/moment-one`
      )
    );
    expect(screen.getByRole("status").textContent).toBe("Link copied.");
  });
});
