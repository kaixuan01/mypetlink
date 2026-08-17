// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getPetProfileTheme } from "@/lib/petProfileThemes";

const ctaMocks = vi.hoisted(() => ({
  authenticated: false,
  push: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: ctaMocks.push }),
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => ctaMocks.authenticated,
}));

vi.mock("@/lib/analytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics")>(
    "@/lib/analytics"
  );
  return { ...actual, trackEvent: ctaMocks.trackEvent };
});

const { PublicProfileCreateCTA } = await import(
  "@/components/marketing/PublicProfileCreateCTA"
);

const theme = getPetProfileTheme("default");

afterEach(cleanup);

beforeEach(() => {
  ctaMocks.authenticated = false;
  ctaMocks.push.mockReset();
  ctaMocks.trackEvent.mockReset();
});

function cta() {
  return screen.getByRole("button", { name: "Create your pet's profile" });
}

describe("PublicProfileCreateCTA", () => {
  it("invites a visitor to create a profile for their own pet", () => {
    render(<PublicProfileCreateCTA theme={theme} />);

    expect(
      screen.getByRole("heading", { name: "Create a profile for your pet" })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Keep their profile, moments and care details together with MyPetLink."
      )
    ).toBeTruthy();
    expect(cta()).toBeTruthy();
  });

  it("offers exactly one action so the pet stays the focus", () => {
    const { container } = render(<PublicProfileCreateCTA theme={theme} />);

    expect(container.querySelectorAll("button, a")).toHaveLength(1);
  });

  it("sends a signed-out visitor to login with /pets/new preserved", () => {
    render(<PublicProfileCreateCTA theme={theme} />);

    fireEvent.click(cta());

    expect(ctaMocks.push).toHaveBeenCalledWith(
      "/login?redirect=%2Fpets%2Fnew"
    );
  });

  it("sends a signed-in visitor straight to pet creation", () => {
    ctaMocks.authenticated = true;

    render(<PublicProfileCreateCTA theme={theme} />);

    fireEvent.click(cta());

    expect(ctaMocks.push).toHaveBeenCalledWith("/pets/new");
  });

  it("records one bounded public-profile event per click", () => {
    render(<PublicProfileCreateCTA theme={theme} />);

    fireEvent.click(cta());

    expect(ctaMocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(ctaMocks.trackEvent).toHaveBeenCalledWith(
      "create_profile_cta_clicked",
      { surface: "public_profile" }
    );
  });

  it("keeps the action reachable as a real control with a descriptive name", () => {
    render(<PublicProfileCreateCTA theme={theme} />);

    const action = cta();
    expect(action.tagName).toBe("BUTTON");
    expect(action.textContent).toContain("Create your pet's profile");
    expect(action.className).toContain("min-h-12");
  });
});
