// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceNav,
  visibleWorkspaceNavGroups,
  type WorkspaceNavGroup,
} from "./WorkspaceNav";

type NavId = "overview" | "reports" | "quotations" | "orders" | "invoices";

const groups: WorkspaceNavGroup<NavId>[] = [
  {
    id: "primary",
    label: null,
    items: [
      { id: "overview", label: "Overview", href: "/workspace?tab=overview" },
      { id: "reports", label: "Reports", href: "/workspace?tab=reports" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    items: [
      { id: "quotations", label: "Quotations", href: "/workspace?tab=quotations" },
      { id: "orders", label: "Orders", href: "/workspace?tab=orders" },
      { id: "invoices", label: "Invoices & Receipts", href: "/workspace?tab=invoices" },
    ],
  },
];

afterEach(cleanup);

describe("WorkspaceNav", () => {
  it("removes hidden items and empty groups", () => {
    expect(
      visibleWorkspaceNavGroups([
        {
          id: "hidden",
          label: "Hidden",
          items: [{ id: "hidden", label: "Hidden", href: "#", visible: false }],
        },
        {
          id: "visible",
          label: "Visible",
          items: [{ id: "orders", label: "Orders", href: "#" }],
        },
      ])
    ).toEqual([
      {
        id: "visible",
        label: null,
        items: [{ id: "orders", label: "Orders", href: "#" }],
      },
    ]);
  });

  it("renders grouped desktop links without a horizontal overflow container", () => {
    render(
      <WorkspaceNav activeId="overview" groups={groups} label="Workspace" onNavigate={vi.fn()} />
    );

    const desktop = screen.getByTestId("workspace-nav-desktop");
    expect(desktop.className).toContain("flex-wrap");
    expect(desktop.className).not.toContain("overflow-x-auto");
    expect(within(desktop).getByText("Sales")).toBeTruthy();
    expect(screen.getByTestId("workspace-nav-item-overview").getAttribute("aria-current")).toBe("page");
  });

  it("uses a grouped mobile navigation sheet with the same destinations", async () => {
    const onNavigate = vi.fn();
    render(
      <WorkspaceNav activeId="overview" groups={groups} label="Workspace" onNavigate={onNavigate} />
    );

    const mobile = screen.getByTestId("workspace-nav-mobile");
    const trigger = within(mobile).getByRole("button", {
      name: "Browse Workspace. Current section: Overview",
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Choose a workspace section" });
    expect(within(dialog).getByText("Sales")).toBeTruthy();
    expect(within(dialog).getAllByRole("link")).toHaveLength(5);
    expect(within(dialog).getByRole("link", { name: /OverviewCurrent/i }).getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));

    fireEvent.click(within(dialog).getByRole("link", { name: "Invoices & Receipts" }));
    expect(onNavigate).toHaveBeenCalledWith("invoices");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.overflow).toBe("");
  });

  it("traps focus, closes on Escape and returns focus to its trigger", async () => {
    render(
      <WorkspaceNav activeId="overview" groups={groups} label="Workspace" onNavigate={vi.fn()} />
    );
    const trigger = within(screen.getByTestId("workspace-nav-mobile")).getByRole("button");
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Close workspace navigation");
    });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
