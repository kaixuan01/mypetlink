// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminTableQuery } from "./useAdminTableQuery";

// Simulated navigation: the hook treats the URL as the source of truth, so the
// mock keeps a mutable query string that router.push updates.
const navState = { pathname: "/admin/tag-inventory", search: "", pushes: [] as string[], replacements: [] as string[] };

function navigate(url: string) {
  navState.search = url.split("?")[1] ?? "";
}

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({
    push: (url: string) => {
      navState.pushes.push(url);
      navigate(url);
    },
    replace: (url: string) => {
      navState.replacements.push(url);
      navigate(url);
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
  navState.pathname = "/admin/tag-inventory";
  navState.pushes = [];
  navState.replacements = [];
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

  it("closes a detail with replace while preserving every list parameter", () => {
    navState.search = "q=topu&status=Active&page=2&sort=tagCode&dir=asc&tag=abc";
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setExtraParam("tag", null));
    rerender();

    expect(navState.replacements).toEqual([
      "/admin/tag-inventory?q=topu&status=Active&page=2&sort=tagCode&dir=asc",
    ]);
    expect(navState.pushes).toEqual([]);
    expect(result.current.actions.getExtraParam("tag")).toBe("");
  });

  it("pushes the first detail and replaces a selected detail with another", () => {
    navState.search = "status=Active&page=2";
    const { result, rerender } = renderQueryHook();

    act(() => result.current.actions.setExtraParam("tag", "abc"));
    rerender();
    act(() => result.current.actions.setExtraParam("tag", "def"));
    rerender();

    expect(navState.pushes).toEqual([
      "/admin/tag-inventory?status=Active&page=2&tag=abc",
    ]);
    expect(navState.replacements).toEqual([
      "/admin/tag-inventory?status=Active&page=2&tag=def",
    ]);
  });

  it("composes rapid URL actions from the latest pending snapshot", () => {
    navState.search = "status=Active&page=2&tag=abc";
    const { result } = renderQueryHook();

    // Deliberately do not rerender between actions, matching the router race
    // that used to restore the stale detail ID in production.
    act(() => {
      result.current.actions.setSearch("milo");
      result.current.actions.setExtraParam("tag", null);
    });

    expect(navState.search).toBe("status=Active&q=milo");
    expect(navState.replacements.at(-1)).toBe(
      "/admin/tag-inventory?status=Active&q=milo"
    );
  });

  it("restores closed detail state through browser Back", () => {
    navState.search = "status=Active&page=2";
    const { result, rerender } = renderQueryHook();
    const listState = navState.search;

    act(() => result.current.actions.setExtraParam("tag", "abc"));
    rerender();
    expect(result.current.actions.getExtraParam("tag")).toBe("abc");

    navState.search = listState;
    rerender();
    expect(result.current.actions.getExtraParam("tag")).toBe("");
  });

  it.each([
    ["/admin/orders", "order"],
    ["/admin/pets", "petProfile"],
  ])("applies the shared close behavior in %s", (pathname, detailKey) => {
    navState.pathname = pathname;
    navState.search = `q=topu&page=3&${detailKey}=record-1`;
    const { result } = renderQueryHook();

    act(() => result.current.actions.setExtraParam(detailKey, null));

    expect(navState.replacements.at(-1)).toBe(`${pathname}?q=topu&page=3`);
  });
});
