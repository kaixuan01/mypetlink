// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminTableQuery } from "./useAdminTableQuery";

// Simulated navigation: the hook treats the URL as the source of truth, so the
// mock keeps a mutable query string that router.push updates.
const navState = { search: "", pushes: [] as string[] };

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tag-inventory",
  useRouter: () => ({
    push: (url: string) => {
      navState.pushes.push(url);
      navState.search = url.split("?")[1] ?? "";
    },
  }),
  useSearchParams: () => new URLSearchParams(navState.search),
}));

const config = {
  filterKeys: ["status", "fulfilment", "batch"] as const,
  defaultSortBy: "generatedAt",
  allowedSortIds: ["generatedAt", "tagCode", "updatedAt"] as const,
  allowedFilterValues: { status: ["Active", "Unclaimed"] } as const,
};

function renderQueryHook() {
  return renderHook(() => useAdminTableQuery(config));
}

beforeEach(() => {
  navState.search = "";
  navState.pushes = [];
});

afterEach(() => cleanup());

describe("useAdminTableQuery", () => {
  it("uses defaults when the URL has no state", () => {
    const { result } = renderQueryHook();

    expect(result.current.query).toEqual({
      search: "",
      page: 1,
      pageSize: 20,
      sortBy: "generatedAt",
      sortDir: "desc",
      filters: {},
    });
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("restores search, filters, sorting, and paging from the URL", () => {
    navState.search =
      "q=milo&status=Unclaimed&batch=BATCH-A&page=3&size=50&sort=tagCode&dir=asc";
    const { result } = renderQueryHook();

    expect(result.current.query).toEqual({
      search: "milo",
      page: 3,
      pageSize: 50,
      sortBy: "tagCode",
      sortDir: "asc",
      filters: { status: "Unclaimed", batch: "BATCH-A" },
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("ignores page sizes outside the allowed presets", () => {
    navState.search = "size=37&page=0";
    const { result } = renderQueryHook();

    expect(result.current.query.pageSize).toBe(20);
    expect(result.current.query.page).toBe(1);
  });

  it("falls back safely for invalid finite filters and sort fields", () => {
    navState.search = "status=made-up&batch=BATCH-A&sort=unsafe&dir=sideways";
    const { result } = renderQueryHook();

    expect(result.current.query.filters).toEqual({ batch: "BATCH-A" });
    expect(result.current.query.sortBy).toBe("generatedAt");
    expect(result.current.query.sortDir).toBe("desc");
  });

  it("updates multiple filter values atomically", () => {
    navState.search = "batch=BATCH-A&status=Active&page=3";
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setFilters({ batch: null, status: null }));
    rerender();

    expect(result.current.query.filters).toEqual({});
    expect(result.current.query.page).toBe(1);
    expect(navState.pushes).toHaveLength(1);
  });

  it("setting a filter writes the URL and resets the page", () => {
    navState.search = "page=4";
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setFilter("status", "Active"));
    rerender();

    expect(result.current.query.filters.status).toBe("Active");
    expect(result.current.query.page).toBe(1);
    expect(navState.pushes).toHaveLength(1);
  });

  it("clearing one filter keeps the others", () => {
    navState.search = "status=Active&batch=BATCH-A";
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setFilter("status", null));
    rerender();

    expect(result.current.query.filters).toEqual({ batch: "BATCH-A" });
  });

  it("clear all removes every filter, the search, and the page", () => {
    navState.search = "q=milo&status=Active&batch=BATCH-A&page=2&sort=tagCode";
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.clearAllFilters());
    rerender();

    expect(result.current.query.filters).toEqual({});
    expect(result.current.query.search).toBe("");
    expect(result.current.query.page).toBe(1);
    // Sorting is a view preference, not a filter.
    expect(result.current.query.sortBy).toBe("tagCode");
  });

  it("sorting the same column toggles direction; a new column starts fresh", () => {
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setSort("tagCode"));
    rerender();
    expect(result.current.query).toMatchObject({ sortBy: "tagCode", sortDir: "asc" });

    act(() => result.current.actions.setSort("tagCode"));
    rerender();
    expect(result.current.query).toMatchObject({ sortBy: "tagCode", sortDir: "desc" });

    act(() => result.current.actions.setSort("updatedAt"));
    rerender();
    expect(result.current.query).toMatchObject({ sortBy: "updatedAt", sortDir: "desc" });
  });

  it("does not push duplicate history entries for no-op changes", () => {
    navState.search = "status=Active";
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setFilter("status", "Active"));
    rerender();
    act(() => result.current.actions.setSearch(""));
    rerender();

    expect(navState.pushes).toHaveLength(0);
  });

  it("browser navigation state is fully recoverable from the URL string", () => {
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setFilter("fulfilment", "Printed"));
    rerender();
    const forwardUrl = navState.search;

    act(() => result.current.actions.setFilter("fulfilment", null));
    rerender();
    expect(result.current.query.filters).toEqual({});

    // Simulate pressing Back: the earlier query string restores the filter.
    navState.search = forwardUrl;
    rerender();
    expect(result.current.query.filters).toEqual({ fulfilment: "Printed" });
  });
});
