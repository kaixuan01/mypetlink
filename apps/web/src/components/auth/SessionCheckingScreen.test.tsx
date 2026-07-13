// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ""} />;
  },
}));

const { SessionCheckingScreen } = await import("./SessionCheckingScreen");

afterEach(() => {
  cleanup();
});

const loginHref = "/login?redirect=%2Fdashboard";

describe("SessionCheckingScreen", () => {
  it("renders nothing visible while waiting (no loader flash)", () => {
    render(<SessionCheckingScreen loginHref={loginHref} state="waiting" />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/getting your account ready/i)).toBeNull();
    expect(screen.queryByText("MyPetLink")).toBeNull();
  });

  it("shows the brand, warm copy, and polite status while checking", () => {
    render(<SessionCheckingScreen loginHref={loginHref} state="checking" />);

    // Brand asset + brand name text.
    expect(screen.getByAltText("MyPetLink")).toBeTruthy();
    expect(screen.getByText("MyPetLink")).toBeTruthy();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Getting your account ready...")).toBeTruthy();
    expect(
      screen.getByText("Preparing your pet dashboard securely.")
    ).toBeTruthy();

    // Loading state has no recovery buttons and no technical wording.
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/token|jwt|auth provider/i);
  });

  it("switches the secondary message for a slow check", () => {
    render(<SessionCheckingScreen loginHref={loginHref} state="slow" />);

    expect(screen.getByText("Getting your account ready...")).toBeTruthy();
    expect(
      screen.getByText("This is taking a little longer than usual.")
    ).toBeTruthy();
  });

  it("offers Retry and Back to sign in when the check times out", () => {
    const onRetry = vi.fn();
    render(
      <SessionCheckingScreen
        loginHref={loginHref}
        onRetry={onRetry}
        state="timeout"
      />
    );

    expect(
      screen.getByText("We could not finish checking your session.")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();

    const signIn = screen.getByRole("link", { name: "Back to sign in" });
    expect(signIn.getAttribute("href")).toBe(loginHref);
  });

  it("disables Retry while a retry is in flight", () => {
    const onRetry = vi.fn();
    render(
      <SessionCheckingScreen
        loginHref={loginHref}
        onRetry={onRetry}
        retrying
        state="error"
      />
    );

    const retry = screen.getByRole("button", { name: "Retrying..." });
    expect(retry.hasAttribute("disabled")).toBe(true);
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows the offline message with Retry only", () => {
    render(
      <SessionCheckingScreen
        loginHref={loginHref}
        onRetry={() => undefined}
        state="offline"
      />
    );

    expect(screen.getByText("You appear to be offline.")).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back to sign in" })).toBeNull();
  });

  it("renders error detail and the development hint when provided", () => {
    render(
      <SessionCheckingScreen
        detail="MyPetLink is having trouble connecting right now."
        devHint="Developer hint: Check that the API and local database are running."
        loginHref={loginHref}
        onRetry={() => undefined}
        state="error"
      />
    );

    expect(
      screen.getByText("MyPetLink is having trouble connecting right now.")
    ).toBeTruthy();
    expect(screen.getByText(/developer hint/i)).toBeTruthy();
  });

  it("keeps the composition compact instead of a full-width card", () => {
    const { container } = render(
      <SessionCheckingScreen loginHref={loginHref} state="checking" />
    );

    const content = container.querySelector(".session-fade-in");
    expect(content?.className).toContain("w-[min(24rem,90vw)]");
  });
});
