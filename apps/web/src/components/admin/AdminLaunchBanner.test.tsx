// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_LAUNCH_BANNER_STORAGE_KEY,
  AdminLaunchBanner,
} from "./AdminLaunchBanner";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("AdminLaunchBanner", () => {
  it("renders compact early-launch context with an explicitly labelled dismiss button", () => {
    render(<AdminLaunchBanner />);

    expect(screen.getByTestId("admin-launch-banner")).toBeTruthy();
    expect(screen.getByText("Early launch mode")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss early launch notice" })).toBeTruthy();
  });

  it("dismisses and persists the choice under a versioned browser key", () => {
    const first = render(<AdminLaunchBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss early launch notice" }));

    expect(screen.queryByTestId("admin-launch-banner")).toBeNull();
    expect(window.localStorage.getItem(ADMIN_LAUNCH_BANNER_STORAGE_KEY)).toBe("dismissed");

    first.unmount();
    render(<AdminLaunchBanner />);
    expect(screen.queryByTestId("admin-launch-banner")).toBeNull();
  });

  it("does not let an older banner key suppress the current version", () => {
    window.localStorage.setItem("mypetlink_admin_early_launch_banner_v0", "dismissed");

    render(<AdminLaunchBanner />);
    expect(screen.getByTestId("admin-launch-banner")).toBeTruthy();
  });
});
