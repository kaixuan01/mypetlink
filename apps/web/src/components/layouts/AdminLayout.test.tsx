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

    // Catalog deep links carry their tab query. Sections now start collapsed
    // unless they hold the active route, so open Catalog before reading it.
    fireEvent.click(screen.getAllByRole("button", { name: /Catalog/ })[0]);
    const promotions = screen.getAllByRole("link", { name: "Promotions" })[0];
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
    expect(document.querySelectorAll("[inert]").length).toBeGreaterThan(0);
    expect(document.body.style.overflow).toBe("hidden");
    // Initial focus lands on the close button inside the drawer.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close admin navigation");

    // Escape closes and restores focus to the trigger.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Admin navigation" })).toBeNull();
    expect(document.activeElement).toBe(openButton);
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("shows the current page title in the compact mobile header", () => {
    navState.pathname = "/admin/tag-inventory";
    render(<AdminLayout>content</AdminLayout>);

    // Appears both as the sidebar link and as the mobile header's current
    // page label.
    expect(screen.getAllByText("Tag Inventory").length).toBeGreaterThanOrEqual(2);
  });
});

describe("collapsible sidebar sections", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with only the section you are in open, so the sidebar stays short", () => {
    navState.pathname = "/admin/orders";
    render(<AdminLayout>content</AdminLayout>);

    const commerce = screen.getAllByRole("button", { name: /Commerce/ })[0];
    expect(commerce.getAttribute("aria-expanded")).toBe("true");

    const catalog = screen.getAllByRole("button", { name: /Catalog/ })[0];
    expect(catalog.getAttribute("aria-expanded")).toBe("false");
    // A collapsed section's links are removed, not merely hidden.
    expect(screen.queryByRole("link", { name: "Promotions" })).toBeNull();
  });

  it("expands and collapses a section on click and records aria-expanded", () => {
    render(<AdminLayout>content</AdminLayout>);

    const catalog = screen.getAllByRole("button", { name: /Catalog/ })[0];
    expect(catalog.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(catalog);
    expect(
      screen.getAllByRole("button", { name: /Catalog/ })[0].getAttribute("aria-expanded")
    ).toBe("true");
    expect(screen.getAllByRole("link", { name: "Promotions" }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Catalog/ })[0]);
    expect(
      screen.getAllByRole("button", { name: /Catalog/ })[0].getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("persists the choice under a versioned key", () => {
    render(<AdminLayout>content</AdminLayout>);
    fireEvent.click(screen.getAllByRole("button", { name: /Catalog/ })[0]);

    const stored = window.localStorage.getItem("mypetlink_admin_nav_sections_v1");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).catalog).toBe(true);
  });

  it("restores a stored choice on the next visit", () => {
    window.localStorage.setItem(
      "mypetlink_admin_nav_sections_v1",
      JSON.stringify({ customers: true })
    );
    render(<AdminLayout>content</AdminLayout>);

    expect(
      screen.getAllByRole("button", { name: /Customers/ })[0].getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("never lets a collapsed preference hide the page you are on", () => {
    // Commerce was explicitly collapsed earlier, but the active route lives there.
    window.localStorage.setItem(
      "mypetlink_admin_nav_sections_v1",
      JSON.stringify({ commerce: false })
    );
    navState.pathname = "/admin/orders";
    render(<AdminLayout>content</AdminLayout>);

    expect(
      screen.getAllByRole("button", { name: /Commerce/ })[0].getAttribute("aria-expanded")
    ).toBe("true");
    expect(screen.getAllByRole("link", { name: "Retail Orders" }).length).toBeGreaterThan(0);
  });

  it("ignores unusable stored values instead of breaking the sidebar", () => {
    window.localStorage.setItem("mypetlink_admin_nav_sections_v1", "not json at all");
    navState.pathname = "/admin/orders";

    expect(() => render(<AdminLayout>content</AdminLayout>)).not.toThrow();
    expect(screen.getAllByRole("link", { name: "Retail Orders" }).length).toBeGreaterThan(0);
  });

  it("labels the owner-order module Retail Orders in Admin only", () => {
    render(<AdminLayout>content</AdminLayout>);

    expect(screen.getAllByRole("link", { name: "Retail Orders" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Orders" })).toBeNull();
  });
});

describe("whole-sidebar collapse", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("collapses to an icon rail and keeps every destination reachable by name", () => {
    navState.pathname = "/admin/orders";
    render(<AdminLayout>content</AdminLayout>);

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const toggle = screen.getByRole("button", { name: "Expand sidebar" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // The rail drops headings, so every item is listed regardless of section.
    expect(screen.getAllByRole("link", { name: "Promotions" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Retail Orders" }).length).toBeGreaterThan(0);
    // Section headings make no sense without labels.
    expect(screen.queryByRole("button", { name: /Commerce/ })).toBeNull();
  });

  it("keeps logout reachable while collapsed", () => {
    render(<AdminLayout>content</AdminLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getAllByRole("button", { name: "Logout" }).length).toBeGreaterThan(0);
  });

  it("persists the rail preference under a versioned key", () => {
    render(<AdminLayout>content</AdminLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(window.localStorage.getItem("mypetlink_admin_sidebar_collapsed_v1")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(window.localStorage.getItem("mypetlink_admin_sidebar_collapsed_v1")).toBe("false");
  });

  it("still marks the active route while collapsed", () => {
    window.localStorage.setItem("mypetlink_admin_sidebar_collapsed_v1", "true");
    navState.pathname = "/admin/orders";
    render(<AdminLayout>content</AdminLayout>);

    const active = screen
      .getAllByRole("link", { name: "Retail Orders" })
      .filter((node) => node.getAttribute("aria-current") === "page");
    expect(active.length).toBeGreaterThan(0);
  });

  it("does not force the mobile drawer into icon-only mode", () => {
    window.localStorage.setItem("mypetlink_admin_sidebar_collapsed_v1", "true");
    render(<AdminLayout>content</AdminLayout>);

    fireEvent.click(screen.getByRole("button", { name: "Open admin navigation" }));

    // The drawer keeps its section headings even when the desktop rail is on.
    const drawer = screen.getByRole("dialog", { name: "Admin navigation" });
    expect(drawer.querySelectorAll("button[aria-expanded]").length).toBeGreaterThan(0);
  });
});
