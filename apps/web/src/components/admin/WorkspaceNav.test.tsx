// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("uses a mobile selector with the same destinations", () => {
    const onNavigate = vi.fn();
    render(
      <WorkspaceNav activeId="overview" groups={groups} label="Workspace" onNavigate={onNavigate} />
    );

    const select = within(screen.getByTestId("workspace-nav-mobile")).getByRole("combobox");
    expect(within(select).getAllByRole("option")).toHaveLength(5);
    fireEvent.change(select, { target: { value: "invoices" } });
    expect(onNavigate).toHaveBeenCalledWith("invoices");
  });
});
