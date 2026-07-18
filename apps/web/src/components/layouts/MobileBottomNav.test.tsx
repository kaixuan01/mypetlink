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

  expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Pets" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Moments" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Tags" })).toBeNull();
});

it("keeps only available secondary destinations in More", () => {
  render(<MobileBottomNav />);

  fireEvent.click(screen.getByRole("button", { name: "More" }));

  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Records" })).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Owner Profile & Contact" })
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Smart Tags" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Orders" })).toBeNull();
});
