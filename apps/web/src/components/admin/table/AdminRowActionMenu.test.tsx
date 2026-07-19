// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminRowActionMenu } from "./AdminRowActionMenu";

afterEach(cleanup);

function rect(overrides: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

describe("AdminRowActionMenu", () => {
  it("supports links, actions, outside click, and Escape focus restoration", () => {
    const onSelect = vi.fn();
    render(<AdminRowActionMenu label="More actions for Topu" actions={[
      { label: "View owner", href: "/admin/users?owner=owner-1" },
      { label: "Copy public link", onSelect },
    ]} />);

    const trigger = screen.getByRole("button", { name: "More actions for Topu" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "View owner" }).getAttribute("href")).toBe("/admin/users?owner=owner-1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy public link" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders the open menu in a portal on document.body, outside any overflow container", () => {
    render(
      <div style={{ overflow: "auto" }} data-testid="scroll-container">
        <AdminRowActionMenu label="More actions" actions={[{ label: "View", href: "/admin/pets" }]} />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu");
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByTestId("scroll-container").contains(menu)).toBe(false);
    // Floating above the table: fixed positioning never grows the table's
    // scroll area or shifts layout.
    expect(menu.className).toContain("fixed");
  });

  it("flips upward when the trigger sits near the bottom of the viewport", () => {
    render(<AdminRowActionMenu label="More actions" actions={[{ label: "View", href: "/admin/pets" }]} />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    trigger.getBoundingClientRect = () =>
      rect({ top: 700, bottom: 740, left: 900, right: 940 });
    const scrollHeight = vi
      .spyOn(Element.prototype, "scrollHeight", "get")
      .mockReturnValue(200);

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const top = Number.parseFloat(menu.style.top);
    scrollHeight.mockRestore();

    // jsdom viewport is 768px tall; space below 740 is too small for a 200px
    // menu, so it must open above the trigger and stay inside the viewport.
    expect(top).toBeLessThan(700);
    expect(top).toBeGreaterThanOrEqual(8);
  });

  it("keeps the menu inside the right edge of the viewport", () => {
    render(<AdminRowActionMenu label="More actions" actions={[{ label: "View", href: "/admin/pets" }]} />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    trigger.getBoundingClientRect = () =>
      rect({ top: 100, bottom: 140, left: window.innerWidth - 20, right: window.innerWidth + 20 });

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const left = Number.parseFloat(menu.style.left);
    expect(left + 224).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it("closes when the page scrolls so the menu never drifts from its row", () => {
    render(<AdminRowActionMenu label="More actions" actions={[{ label: "View", href: "/admin/pets" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.scroll(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps only one row menu open at a time", () => {
    render(
      <>
        <AdminRowActionMenu label="Row one actions" actions={[{ label: "One", href: "/admin/pets" }]} />
        <AdminRowActionMenu label="Row two actions" actions={[{ label: "Two", href: "/admin/pets" }]} />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Row one actions" }));
    expect(screen.getByRole("menuitem", { name: "One" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Row two actions" }));
    expect(screen.queryByRole("menuitem", { name: "One" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Two" })).toBeTruthy();
    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });

  it("supports arrow-key navigation between menu items", () => {
    render(<AdminRowActionMenu label="More actions" actions={[
      { label: "First", href: "/admin/pets" },
      { label: "Second", href: "/admin/users" },
    ]} />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = screen.getByRole("menu");

    // Opening with the keyboard focuses the first item immediately.
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First" }));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Second" }));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First" }));
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Second" }));
  });
});
