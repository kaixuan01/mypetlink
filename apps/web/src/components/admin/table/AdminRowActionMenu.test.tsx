// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminRowActionMenu } from "./AdminRowActionMenu";

afterEach(cleanup);

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

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
