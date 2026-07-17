// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDataTable, type AdminColumn } from "./AdminDataTable";

afterEach(() => cleanup());

type Row = { id: string; name: string };

const columns: AdminColumn<Row>[] = [
  { id: "name", header: "Name", sortId: "name", cell: (row) => row.name },
];

const baseProps = {
  columns,
  rowKey: (row: Row) => row.id,
  emptyTitle: "Nothing here.",
  page: 1,
  pageSize: 20,
  onPageChange: () => undefined,
};

describe("AdminDataTable", () => {
  it("shows a skeleton while loading", () => {
    const { container } = render(
      <AdminDataTable {...baseProps} loading rows={[]} total={0} />
    );

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toBe("Loading records.");
  });

  it("shows the empty state with description", () => {
    render(
      <AdminDataTable
        {...baseProps}
        emptyDescription="Generate stock to begin."
        rows={[]}
        total={0}
      />
    );

    expect(screen.getByText("Nothing here.")).toBeDefined();
    expect(screen.getByText("Generate stock to begin.")).toBeDefined();
  });

  it("shows the error state and retries", () => {
    const onRetry = vi.fn();
    render(
      <AdminDataTable
        {...baseProps}
        error="We couldn't load this list."
        onRetry={onRetry}
        rows={[]}
        total={0}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("selects rows individually and per page", () => {
    const onSelectedIdsChange = vi.fn();
    render(
      <AdminDataTable
        {...baseProps}
        onSelectedIdsChange={onSelectedIdsChange}
        rows={[
          { id: "a", name: "Alpha" },
          { id: "b", name: "Beta" },
        ]}
        selectable
        selectedIds={new Set<string>()}
        total={2}
      />
    );

    fireEvent.click(screen.getByLabelText("Select row a"));
    expect(onSelectedIdsChange).toHaveBeenLastCalledWith(new Set(["a"]));

    fireEvent.click(screen.getByLabelText("Select all rows on this page"));
    expect(onSelectedIdsChange).toHaveBeenLastCalledWith(new Set(["a", "b"]));
  });

  it("marks the sorted column and requests sorting", () => {
    const onSortChange = vi.fn();
    render(
      <AdminDataTable
        {...baseProps}
        onSortChange={onSortChange}
        rows={[{ id: "a", name: "Alpha" }]}
        sortBy="name"
        sortDir="asc"
        total={1}
      />
    );

    const header = screen.getByRole("columnheader", { name: "Name" });
    expect(header.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(onSortChange).toHaveBeenCalledWith("name");
  });

  it("keeps the identity column sticky beside selectable checkboxes", () => {
    render(
      <AdminDataTable
        {...baseProps}
        rows={[{ id: "a", name: "Alpha" }]}
        selectable
        selectedIds={new Set<string>()}
        stickyFirstColumn
        total={1}
      />
    );

    expect(screen.getByRole("columnheader", { name: "Name" }).className).toContain("left-10");
    expect(screen.getByText("Alpha").closest("td")?.className).toContain("left-10");
  });

  it("disables pagination at the edges and reports the range", () => {
    const onPageChange = vi.fn();
    render(
      <AdminDataTable
        {...baseProps}
        onPageChange={onPageChange}
        page={1}
        rows={[{ id: "a", name: "Alpha" }]}
        total={45}
      />
    );

    expect(screen.getByText("Showing 1–20 of 45")).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
