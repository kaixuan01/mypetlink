// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logoutOwner: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/auth/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/brand/BrandLogo", () => ({
  BrandLogo: () => <span>MyPetLink logo</span>,
}));

vi.mock("@/components/layouts/MobileBottomNav", () => ({
  MobileBottomNav: () => null,
}));

vi.mock("@/components/portal/OwnerHeaderActions", () => ({
  OwnerHeaderActionsProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
  OwnerPortalHeader: () => null,
}));

vi.mock("@/lib/ownerSettings", () => ({
  defaultOwnerSettings: { ownerDisplayName: "Pet Owner" },
  getOwnerDisplayName: () => "Pet Owner",
  readOwnerSettings: () => ({ ownerDisplayName: "Pet Owner" }),
  subscribeOwnerSettings: () => () => undefined,
}));

vi.mock("@/lib/sidebarState", () => ({
  getServerSidebarCollapsed: () => false,
  getSidebarCollapsed: () => false,
  setSidebarCollapsed: vi.fn(),
  subscribeSidebarCollapsed: () => () => undefined,
}));

vi.mock("@/services/authService", () => ({
  logoutOwner: mocks.logoutOwner,
}));

import { AppLayout } from "./AppLayout";

afterEach(cleanup);

describe("AppLayout desktop navigation", () => {
  beforeEach(() => {
    mocks.logoutOwner.mockReset();
    mocks.replace.mockReset();
  });

  it("uses the same customer-facing labels as the mobile More menu", () => {
    render(
      <AppLayout>
        <p>Owner content</p>
      </AppLayout>
    );

    expect(screen.getByRole("link", { name: "Care Records" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Owner Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(screen.queryByText("Records", { exact: true })).toBeNull();
    expect(screen.queryByText("Owner Profile & Contact")).toBeNull();
    expect(screen.queryByRole("button", { name: "Logout" })).toBeNull();
  });

  it("makes main the single owner of mobile bottom-navigation clearance", () => {
    render(
      <AppLayout>
        <p>Owner content</p>
      </AppLayout>
    );

    const main = screen.getByRole("main");
    const shell = main.parentElement?.parentElement;

    expect(main.className).toContain("--owner-bottom-nav-height");
    expect(main.className).toContain("safe-area-inset-bottom");
    expect(shell?.className).not.toContain("--owner-bottom-nav-height");
    expect(shell?.className).not.toContain("safe-area-inset-bottom");
  });
});
