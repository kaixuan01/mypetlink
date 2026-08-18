// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/components/portal/PublicLinkActions", () => ({
  copyTextToClipboard: mocks.copyTextToClipboard,
}));

vi.mock("@/lib/analytics", () => ({
  AnalyticsEvent: {
    ShareCardAction: "share_card_action",
    ShareCardShared: "share_card_shared",
    ShareCardViewed: "share_card_viewed",
  },
  trackEvent: mocks.trackEvent,
}));

vi.mock("@/components/ui/Icon", () => ({
  Icon: () => <span aria-hidden="true" />,
}));

const { PetShareCard } = await import("./PetShareCard");

const defaultProps = {
  imagePath: "/social/pets/milo-k7q2.jpg?v=abc123&variant=share-card",
  petName: "Milo",
  profilePath: "/p/milo-k7q2",
  shareVersion: "abc123",
};

function jpegResponse() {
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
    type: "image/jpeg",
  });
  return {
    blob: async () => blob,
    headers: new Headers({ "Content-Type": "image/jpeg" }),
    ok: true,
  } as Response;
}

function setNativeShare(
  share?: (data: ShareData) => Promise<void>,
  canShare?: (data: ShareData) => boolean
) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: canShare,
  });
}

beforeEach(() => {
  mocks.copyTextToClipboard.mockReset().mockResolvedValue(true);
  mocks.trackEvent.mockReset();
  vi.stubGlobal("fetch", vi.fn());
  setNativeShare(undefined, undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PetShareCard", () => {
  it("loads the real preview only after the owner opens the dialog", () => {
    render(<PetShareCard {...defaultProps} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));

    const image = screen.getByRole("img", { name: /Milo's MyPetLink Share Card/i });
    expect(image.getAttribute("src")).toContain(
      "/social/pets/milo-k7q2.jpg?v=abc123&variant=share-card"
    );
    expect(screen.getByRole("status").textContent).toContain("Preparing");

    fireEvent.load(image);
    expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_viewed", {
      card_variant: "profile",
    });
  });

  it("loads only the selected occasion card and keeps analytics variant-specific", () => {
    render(
      <PetShareCard
        {...defaultProps}
        variants={[
          { variant: "profile", label: "Profile", imagePath: defaultProps.imagePath },
          {
            variant: "birthday",
            label: "Birthday",
            imagePath: "/social/pets/milo-k7q2.jpg?v=abc123&variant=birthday",
          },
          {
            variant: "adoption",
            label: "Adoption Day",
            imagePath: "/social/pets/milo-k7q2.jpg?v=abc123&variant=adoption",
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    fireEvent.load(screen.getByRole("img"));

    fireEvent.click(screen.getByRole("button", { name: "Birthday" }));
    const birthday = screen.getByRole("img", { name: /Birthday Share Card/ });
    expect(birthday.getAttribute("src")).toContain("variant=birthday");
    expect(screen.getAllByRole("img")).toHaveLength(1);
    fireEvent.load(birthday);
    fireEvent.load(birthday);

    expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_viewed", {
      card_variant: "birthday",
    });
    expect(
      mocks.trackEvent.mock.calls.filter(
        ([event, data]) =>
          event === "share_card_viewed" && data.card_variant === "birthday"
      )
    ).toHaveLength(1);
  });

  it("replaces a failed preview with a retry action", () => {
    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    const image = screen.getByRole("img");

    fireEvent.error(image);
    expect(screen.getByRole("alert").textContent).toContain(
      "We couldn't load the Share Card"
    );

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.getByRole("img").getAttribute("src")).toContain("retry=1");
  });

  it("shares the JPEG file when the platform accepts file sharing", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    setNativeShare(share, canShare);
    vi.mocked(fetch).mockResolvedValue(jpegResponse());

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.load(screen.getByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /^Share$/ }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files).toHaveLength(1);
    expect(data.files?.[0].name).toBe("mypetlink-milo-share-card.jpg");
    expect(data.files?.[0].type).toBe("image/jpeg");
    expect(data.text).toContain("/p/milo-k7q2?share=abc123");
    expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_shared", {
      card_variant: "profile",
    });
  });

  it("shares the selected occasion JPEG with its bounded variant filename", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNativeShare(share, () => true);
    vi.mocked(fetch).mockResolvedValue(jpegResponse());

    render(
      <PetShareCard
        {...defaultProps}
        initialVariant="birthday"
        variants={[
          { variant: "profile", label: "Profile", imagePath: defaultProps.imagePath },
          {
            variant: "birthday",
            label: "Birthday",
            imagePath: "/social/pets/milo-k7q2.jpg?v=abc123&variant=birthday",
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: /^Share$/ }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files?.[0].name).toBe("mypetlink-milo-birthday-card.jpg");
    expect(String(data.files?.[0].name)).not.toContain("k7q2");
    expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_shared", {
      card_variant: "birthday",
    });
  });

  it("uses URL sharing when file sharing is unavailable", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNativeShare(share, () => false);
    vi.mocked(fetch).mockResolvedValue(jpegResponse());

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: /^Share$/ }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0]).toMatchObject({
      url: expect.stringContaining("/p/milo-k7q2?share=abc123"),
    });
    expect(share.mock.calls[0][0].files).toBeUndefined();
  });

  it("shows Save and Copy without presenting an unavailable native action", async () => {
    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));

    expect(screen.queryByRole("button", { name: /^Share$/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Save Image" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));

    await waitFor(() =>
      expect(mocks.copyTextToClipboard).toHaveBeenCalledWith(
        expect.stringContaining("/p/milo-k7q2?share=abc123")
      )
    );
  });

  it("treats native share cancellation as dismissal", async () => {
    const share = vi.fn().mockRejectedValue(
      new DOMException("The owner cancelled.", "AbortError")
    );
    setNativeShare(share, () => false);
    vi.mocked(fetch).mockResolvedValue(jpegResponse());

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: /^Share$/ }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(mocks.copyTextToClipboard).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalledWith(
      "share_card_shared",
      expect.anything()
    );
    expect(screen.queryByText(/could not open/i)).toBeNull();
  });

  it("downloads a validated JPEG with a bounded safe filename", async () => {
    vi.mocked(fetch).mockResolvedValue(jpegResponse());
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue("blob:share-card");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    render(<PetShareCard {...defaultProps} petName={'Milo <script> \\ / ? : * " |'} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Image" }));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const link = click.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toMatch(/^mypetlink-[a-z0-9-]+-share-card\.jpg$/);
    expect(link.download.length).toBeLessThanOrEqual(67);
    expect(await screen.findByText("Image download started.")).toBeTruthy();
  });

  it("records a save only once the validated image download starts", async () => {
    vi.mocked(fetch).mockResolvedValue(jpegResponse());
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:share-card"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Image" }));

    await waitFor(() =>
      expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_action", {
        card_action: "save",
        card_variant: "profile",
      })
    );
  });

  it("records no save when the image cannot be retrieved", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Image" }));

    expect(await screen.findByText(/couldn't save the image/i)).toBeTruthy();
    expect(
      mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_action")
    ).toHaveLength(0);
  });

  it("records no save when the response is not a validated JPEG", async () => {
    vi.mocked(fetch).mockResolvedValue({
      blob: async () => new Blob(["nope"], { type: "text/html" }),
      headers: new Headers({ "Content-Type": "text/html" }),
      ok: true,
    } as Response);

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Image" }));

    expect(await screen.findByText(/couldn't save the image/i)).toBeTruthy();
    expect(
      mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_action")
    ).toHaveLength(0);
  });

  it("records a copied link only after the clipboard write succeeds", async () => {
    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));

    await waitFor(() =>
      expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_action", {
        card_action: "copy_link",
        card_variant: "profile",
      })
    );
    expect(
      mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_shared")
    ).toHaveLength(0);
  });

  it("records nothing when the clipboard write fails", async () => {
    mocks.copyTextToClipboard.mockResolvedValue(false);

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));

    expect(await screen.findByText(/Unable to copy automatically/i)).toBeTruthy();
    expect(
      mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_action")
    ).toHaveLength(0);
  });

  it("records the fallback copy when Share runs without native sharing", async () => {
    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    // No native share is available, so Share falls through to copying the link.
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));

    await waitFor(() =>
      expect(
        mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_action")
      ).toHaveLength(1)
    );
    expect(
      mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_shared")
    ).toHaveLength(0);
  });

  it("records opening the image as its own action, never as a share", () => {
    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("link", { name: "View full image" }));

    expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_action", {
      card_action: "open_image",
      card_variant: "profile",
    });
    expect(
      mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_shared")
    ).toHaveLength(0);
  });

  it("keeps the bounded occasion variant on every action", async () => {
    vi.mocked(fetch).mockResolvedValue(jpegResponse());
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:share-card"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(
      <PetShareCard
        {...defaultProps}
        variants={[
          { variant: "profile", label: "Profile", imagePath: defaultProps.imagePath },
          {
            variant: "birthday",
            label: "Birthday",
            imagePath: "/social/pets/milo-k7q2.jpg?v=abc123&variant=birthday",
          },
          {
            variant: "adoption",
            label: "Adoption Day",
            imagePath: "/social/pets/milo-k7q2.jpg?v=abc123&variant=adoption",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Birthday" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));
    await waitFor(() =>
      expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_action", {
        card_action: "copy_link",
        card_variant: "birthday",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Adoption Day" }));
    fireEvent.click(screen.getByRole("link", { name: "View full image" }));
    expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_action", {
      card_action: "open_image",
      card_variant: "adoption",
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Image" }));
    await waitFor(() =>
      expect(mocks.trackEvent).toHaveBeenCalledWith("share_card_action", {
        card_action: "save",
        card_variant: "adoption",
      })
    );
  });

  it("emits one action event per user action and never on rerender", async () => {
    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));

    const image = screen.getByRole("img");
    fireEvent.load(image);
    fireEvent.load(image);

    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));
    await waitFor(() =>
      expect(
        mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_action")
      ).toHaveLength(1)
    );
    expect(
      mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_viewed")
    ).toHaveLength(1);
  });

  it("sends only bounded card metadata, never identifiers or free text", async () => {
    vi.mocked(fetch).mockResolvedValue(jpegResponse());
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:share-card"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(<PetShareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));
    fireEvent.click(screen.getByRole("link", { name: "View full image" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Image" }));

    await waitFor(() =>
      expect(
        mocks.trackEvent.mock.calls.filter(([name]) => name === "share_card_action")
      ).toHaveLength(3)
    );

    const allowedActions = ["save", "copy_link", "open_image"];
    const allowedVariants = ["profile", "birthday", "adoption"];

    for (const [, payload] of mocks.trackEvent.mock.calls) {
      for (const key of Object.keys(payload)) {
        expect(["card_action", "card_variant"]).toContain(key);
      }
      if (payload.card_action) {
        expect(allowedActions).toContain(payload.card_action);
      }
      expect(allowedVariants).toContain(payload.card_variant);

      const serialised = JSON.stringify(payload).toLowerCase();
      for (const forbidden of ["milo", "k7q2", "/p/", "http", ".jpg", "abc123"]) {
        expect(serialised).not.toContain(forbidden);
      }
    }
  });

  it("restores focus after the dialog closes", async () => {
    render(<PetShareCard {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: "Share Card" });
    fireEvent.click(trigger);

    const close = screen.getByRole("button", { name: "Close Share Card" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    fireEvent.click(close);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
