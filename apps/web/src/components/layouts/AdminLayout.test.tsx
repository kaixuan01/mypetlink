// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLayout } from "./AdminLayout";

const navState = vi.hoisted(() => ({ pathname: "/admin/orders", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navState.search),
}));

vi.mock("@/components/auth/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/brand/BrandLogo", () => ({
  BrandLogo: () => <span>Logo</span>,
}));

vi.mock("@/services/authService", () => ({ logoutAdmin: vi.fn() }));

beforeEach(() => {
  navState.pathname = "/admin/orders";
  navState.search = "";
});

afterEach(cleanup);

describe("AdminLayout navigation", () => {
  it("renders grouped navigation from the shared config in desktop and drawer alike", async () => {
    render(<AdminLayout>content</AdminLayout>);

    // Desktop sidebar renders the group headings from the shared config.
    expect(screen.getByText("Commerce")).toBeDefined();
    expect(screen.getByText("Catalog")).toBeDefined();
    expect(screen.getByText("Tag Operations")).toBeDefined();
    expect(screen.getByText("Customers")).toBeDefined();
    expect(screen.getByText("Configuration")).toBeDefined();

    // Catalog deep links carry their tab query.
    const promotions = screen.getByRole("link", { name: "Promotions" });
    expect(promotions.getAttribute("href")).toBe("/admin/tag-products?tab=promotions");
  });

  it("marks the active route with aria-current, including query-driven tabs", () => {
    navState.pathname = "/admin/tag-products";
    navState.search = "tab=promotions";
    render(<AdminLayout>content</AdminLayout>);

    expect(screen.getByRole("link", { name: "Promotions" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Tag Products" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps the mobile drawer out of the document until opened, then focus-manages and restores", () => {
    render(<AdminLayout>content</AdminLayout>);

    // Closed drawer: the dialog does not exist, so nothing in it is
    // keyboard-focusable.
    expect(screen.queryByRole("dialog", { name: "Admin navigation" })).toBeNull();

    const openButton = screen.getByRole("button", { name: "Open admin navigation" });
    openButton.focus();
    fireEvent.click(openButton);

    const dialog = screen.getByRole("dialog", { name: "Admin navigation" });
    expect(dialog).toBeDefined();
    // Initial focus lands on the close button inside the drawer.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close admin navigation");

    // Escape closes and restores focus to the trigger.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Admin navigation" })).toBeNull();
    expect(document.activeElement).toBe(openButton);
  });

  it("shows the current page title in the compact mobile header", () => {
    navState.pathname = "/admin/tag-inventory";
    render(<AdminLayout>content</AdminLayout>);

    // Appears both as the sidebar link and as the mobile header's current
    // page label.
    expect(screen.getAllByText("Tag Inventory").length).toBeGreaterThanOrEqual(2);
  });
});
