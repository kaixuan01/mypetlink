// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminDataTable, type AdminColumn } from "./AdminDataTable";

type Row = { id: string; code: string; name: string };

const rows: Row[] = [
  { id: "1", code: "MPL-MER-00001", name: "Happy Paws Veterinary Group Sdn Bhd" },
  { id: "2", code: "MPL-MER-00002", name: "Second Merchant Sdn Bhd" },
];

const columns: AdminColumn<Row>[] = [
  { id: "code", header: "Code", cell: (row) => <span>{row.code}</span> },
  { id: "name", header: "Business", cell: (row) => <span>{row.name}</span> },
];

afterEach(cleanup);

const renderTable = (props: Record<string, unknown> = {}) =>
  render(
    <AdminDataTable
      columns={columns}
      emptyTitle="No merchants match these filters."
      loading={false}
      onPageChange={() => {}}
      page={1}
      pageSize={20}
      rowKey={(row: Row) => row.id}
      rows={rows}
      stickyFirstColumn
      total={rows.length}
      {...props}
    />
  );

describe("Admin data table layout", () => {
  it("contains its own horizontal scrolling instead of widening the page", () => {
    const { container } = renderTable();
    const scroller = container.querySelector(".overflow-x-auto") as HTMLElement;

    expect(scroller).toBeTruthy();
    // The scroll container is the containing block, so the absolutely
    // positioned screen-reader labels inside it cannot extend the document.
    expect(scroller.className).toContain("relative");
  });

  it("pins the first column only where there is room for it", () => {
    const { container } = renderTable();
    const firstHeader = container.querySelector("thead th") as HTMLElement;

    // At the narrowest widths the pinned column would cover the row actions.
    expect(firstHeader.className).toContain("sm:sticky");
    expect(firstHeader.className).not.toMatch(/(^|\s)sticky(\s|$)/);
  });

  it("does not pin anything when the caller has not asked for it", () => {
    const { container } = renderTable({ stickyFirstColumn: false });
    const firstHeader = container.querySelector("thead th") as HTMLElement;

    expect(firstHeader.className).not.toContain("sticky");
  });

  it("gives every column header a scope so the table reads correctly", () => {
    const { container } = renderTable();

    for (const header of container.querySelectorAll("thead th")) {
      expect(header.getAttribute("scope")).toBe("col");
    }
  });

  it("announces an empty result rather than leaving it silent", () => {
    renderTable({ rows: [] });

    const empty = screen.getByRole("status");
    expect(within(empty).getByText("No merchants match these filters.")).toBeTruthy();
  });

  it("announces that records are loading", () => {
    renderTable({ loading: true, rows: [] });

    expect(screen.getByRole("status").textContent).toContain("Loading records.");
  });

  it("never shows an empty-result message while it is still loading", () => {
    renderTable({ loading: true, rows: [] });

    expect(screen.queryByText("No merchants match these filters.")).toBeNull();
  });
});
