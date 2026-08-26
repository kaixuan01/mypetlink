// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

const { MobileBottomNav } = await import("./MobileBottomNav");

afterEach(() => {
  cleanup();
  navigation.pathname = "/dashboard";
  vi.clearAllMocks();
});

it("renders Home, Pets, Moments, and More at narrow mobile width", () => {
  render(<MobileBottomNav />);

  const portal = screen.getByRole("navigation", { name: "Owner portal" });
  Object.defineProperty(portal, "clientWidth", { configurable: true, value: 320 });
  fireEvent(window, new Event("resize"));

  expect(portal.className).toContain("safe-area-inset-bottom");
  expect(portal.className).toContain("owner-mobile-bottom-nav");
  expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Pets" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Moments" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Tags" })).toBeNull();
});

it("keeps only available secondary destinations in More", () => {
  render(<MobileBottomNav />);

  fireEvent.click(screen.getByRole("button", { name: "More" }));

  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelector("section")?.className).toContain(
    "safe-area-inset-bottom"
  );
  expect(screen.getByRole("link", { name: "Care Records" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Owner Settings" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  expect(
    screen.getByText(
      "Manage care records, contact details, privacy, and account settings."
    )
  ).toBeTruthy();
  expect(screen.queryByText("Owner Profile & Contact")).toBeNull();
  expect(screen.queryByText("Records", { exact: true })).toBeNull();
  expect(screen.queryByRole("link", { name: "Smart Tags" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Orders" })).toBeNull();
});
