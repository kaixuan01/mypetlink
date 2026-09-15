// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  likeMoment: vi.fn(),
  unlikeMoment: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/u/tanfamily",
}));

vi.mock("@/services/momentLikeService", () => ({
  likeMoment: (...args: unknown[]) => mocks.likeMoment(...args),
  unlikeMoment: (...args: unknown[]) => mocks.unlikeMoment(...args),
}));

import { LikeButton } from "@/components/social/LikeButton";
import { ApiClientError } from "@/services/apiClient";

function renderButton(
  props: {
    likeCount?: number;
    viewerHasLiked?: boolean;
    signedIn?: boolean | null;
  } = {}
) {
  const onChange = vi.fn();
  render(
    <LikeButton
      likeCount={props.likeCount ?? 3}
      momentId="moment-1"
      momentTitle="Beach day"
      onChange={onChange}
      signedIn={"signedIn" in props ? props.signedIn! : true}
      viewerHasLiked={props.viewerHasLiked ?? false}
    />
  );

  return { onChange };
}

function likeButton() {
  return screen.getByTestId("like-button") as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LikeButton", () => {
  it("likes optimistically and then keeps the server's count", async () => {
    let resolve: (value: {
      momentId: string;
      likeCount: number;
      viewerHasLiked: boolean;
    }) => void = () => undefined;
    mocks.likeMoment.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );

    const { onChange } = renderButton();
    fireEvent.click(likeButton());

    expect(onChange).toHaveBeenCalledWith({ likeCount: 4, viewerHasLiked: true });

    // Somebody else liked it in between; the server's number wins.
    resolve({ momentId: "moment-1", likeCount: 9, viewerHasLiked: true });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        likeCount: 9,
        viewerHasLiked: true,
      })
    );
  });

  it("rolls back to the exact previous state when the like is refused", async () => {
    mocks.likeMoment.mockRejectedValue(
      new ApiClientError(429, "rate_limited", "You're doing that too quickly.")
    );

    const { onChange } = renderButton({ likeCount: 3 });
    fireEvent.click(likeButton());

    await screen.findByTestId("like-button-error");

    expect(screen.getByTestId("like-button-error").textContent).toBe(
      "You're doing that too quickly."
    );
    expect(onChange).toHaveBeenLastCalledWith({
      likeCount: 3,
      viewerHasLiked: false,
    });
  });

  it("unlikes, and never shows a negative count", async () => {
    mocks.unlikeMoment.mockResolvedValue({
      momentId: "moment-1",
      likeCount: 0,
      viewerHasLiked: false,
    });

    const { onChange } = renderButton({ likeCount: 0, viewerHasLiked: true });
    fireEvent.click(likeButton());

    expect(onChange).toHaveBeenCalledWith({ likeCount: 0, viewerHasLiked: false });
    await waitFor(() => expect(mocks.unlikeMoment).toHaveBeenCalledWith("moment-1"));
    expect(mocks.likeMoment).not.toHaveBeenCalled();
  });

  it("names the Moment so a grid of hearts is not a grid of Like", () => {
    renderButton({ likeCount: 1 });

    expect(likeButton().getAttribute("aria-label")).toBe(
      "Like Beach day. 1 like."
    );
    expect(likeButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("reports the liked state to assistive technology", () => {
    renderButton({ viewerHasLiked: true, likeCount: 2 });

    expect(likeButton().getAttribute("aria-pressed")).toBe("true");
    expect(likeButton().getAttribute("aria-label")).toBe(
      "Remove your like from Beach day. 2 likes."
    );
  });

  it("sends a signed-out visitor to sign in and back to where they were", () => {
    renderButton({ signedIn: false });
    const link = screen.getByTestId("like-button-signin");

    expect(link.getAttribute("href")).toBe("/login?redirect=%2Fu%2Ftanfamily");
    expect(screen.queryByTestId("like-button")).toBeNull();
  });

  it("still shows a signed-out visitor the count", () => {
    renderButton({ signedIn: false, likeCount: 12 });

    expect(screen.getByTestId("like-button-signin").textContent).toContain("12");
  });

  it("stays inert until the signed-in check has run", () => {
    renderButton({ signedIn: null });

    expect(likeButton().disabled).toBe(true);
  });

  it("ignores a double tap while the first is still in flight", async () => {
    mocks.likeMoment.mockReturnValue(new Promise(() => undefined));

    renderButton();
    const button = likeButton();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(true));
    expect(mocks.likeMoment).toHaveBeenCalledTimes(1);
  });
});
