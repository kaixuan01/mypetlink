"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

// URL-backed state for admin listing pages. The query string is the single
// source of truth: refreshing keeps the view, Back/Forward restores previous
// filters, and links can be shared between admins.

export type SortDir = "asc" | "desc";

export const ADMIN_PAGE_SIZES = [20, 50, 100] as const;

export type AdminTableQueryConfig = {
  // Filter keys this page is allowed to read/write (everything except the
  // reserved q / page / size / sort / dir keys).
  filterKeys: readonly string[];
  defaultSortBy: string;
  defaultSortDir?: SortDir;
  defaultPageSize?: number;
  // Invalid sort values are ignored before they reach the API. This keeps a
  // hand-edited or stale URL usable and mirrors the server allow-list.
  allowedSortIds?: readonly string[];
  // Optional allow-lists for finite filters. Free-text/date filters do not
  // need an entry here.
  allowedFilterValues?: Readonly<Record<string, readonly string[]>>;
};

export type AdminTableQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: SortDir;
  filters: Record<string, string>;
};

export type AdminTableQueryActions = {
  setSearch: (value: string) => void;
  setFilter: (key: string, value: string | null) => void;
  setFilters: (values: Readonly<Record<string, string | null>>) => void;
  clearAllFilters: () => void;
  setSort: (sortId: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  // Extra URL params outside the filter model (e.g. an open detail row).
  setExtraParam: (key: string, value: string | null) => void;
  getExtraParam: (key: string) => string;
};

function parsePage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string | null, fallback: number) {
  const parsed = Number(value);
  return (ADMIN_PAGE_SIZES as readonly number[]).includes(parsed) ? parsed : fallback;
}

export function useAdminTableQuery(
  config: AdminTableQueryConfig
): { query: AdminTableQuery; actions: AdminTableQueryActions; hasActiveFilters: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const renderedQueryString = searchParams.toString();
  const latestQueryRef = useRef(renderedQueryString);

  // Next navigation is asynchronous. Keep an eagerly updated snapshot so a
  // second action (for example closing a drawer while a filter navigation is
  // settling) never rebuilds the URL from stale render-time search params.
  useEffect(() => {
    latestQueryRef.current = renderedQueryString;
  }, [renderedQueryString]);

  const defaultSortDir = config.defaultSortDir ?? "desc";
  const defaultPageSize = config.defaultPageSize ?? 20;

  const query = useMemo<AdminTableQuery>(() => {
    const filters: Record<string, string> = {};

    for (const key of config.filterKeys) {
      const value = searchParams.get(key);

      const allowed = config.allowedFilterValues?.[key];
      if (value && (!allowed || allowed.includes(value))) {
        filters[key] = value;
      }
    }

    const dir = searchParams.get("dir");

    return {
      search: searchParams.get("q") ?? "",
      page: parsePage(searchParams.get("page")),
      pageSize: parsePageSize(searchParams.get("size"), defaultPageSize),
      sortBy:
        searchParams.get("sort") &&
        (!config.allowedSortIds || config.allowedSortIds.includes(searchParams.get("sort")!))
          ? searchParams.get("sort")!
          : config.defaultSortBy,
      sortDir: dir === "asc" || dir === "desc" ? dir : defaultSortDir,
      filters,
    };
    // config values are expected to be stable per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, config.defaultSortBy, defaultSortDir, defaultPageSize]);

  const navigate = useCallback(
    (mutate: (params: URLSearchParams) => void, history: "push" | "replace" = "push") => {
      const current = latestQueryRef.current;
      const params = new URLSearchParams(current);
      mutate(params);
      const queryString = params.toString();

      // Skip no-op navigations so repeated commits (e.g. blur after a
      // debounced search) never stack duplicate history entries.
      if (queryString === current) {
        return;
      }

      latestQueryRef.current = queryString;
      const method = history === "replace" ? router.replace : router.push;
      method(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname]
  );

  const setOrDelete = (params: URLSearchParams, key: string, value: string | null) => {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  };

  const actions = useMemo<AdminTableQueryActions>(
    () => ({
      setSearch: (value) =>
        navigate((params) => {
          setOrDelete(params, "q", value.trim() === "" ? null : value);
          params.delete("page");
        }),
      setFilter: (key, value) =>
        navigate((params) => {
          setOrDelete(params, key, value);
          params.delete("page");
        }),
      setFilters: (values) =>
        navigate((params) => {
          for (const [key, value] of Object.entries(values)) {
            setOrDelete(params, key, value);
          }
          params.delete("page");
        }),
      clearAllFilters: () =>
        navigate((params) => {
          for (const key of config.filterKeys) {
            params.delete(key);
          }

          params.delete("q");
          params.delete("page");
        }),
      setSort: (sortId) =>
        navigate((params) => {
          const currentSort = params.get("sort") || config.defaultSortBy;
          const currentDir = params.get("dir") ?? defaultSortDir;

          if (currentSort === sortId) {
            setOrDelete(params, "dir", currentDir === "asc" ? "desc" : "asc");
          } else {
            params.set("sort", sortId);
            // Dates read best newest-first; text columns A-Z first.
            params.set("dir", sortId.endsWith("At") ? "desc" : "asc");
          }

          params.delete("page");
        }),
      setPage: (page) =>
        navigate((params) => {
          setOrDelete(params, "page", page <= 1 ? null : String(page));
        }),
      setPageSize: (pageSize) =>
        navigate((params) => {
          setOrDelete(params, "size", pageSize === defaultPageSize ? null : String(pageSize));
          params.delete("page");
        }),
      setExtraParam: (key, value) => {
        const currentValue = new URLSearchParams(latestQueryRef.current).get(key);

        // Opening a detail from the list creates one useful history entry so
        // browser Back closes it. Switching records and closing replace that
        // entry, preventing stale detail IDs and needless Back-button steps.
        navigate((params) => {
          setOrDelete(params, key, value);
        }, value !== null && currentValue === null ? "push" : "replace");
      },
      getExtraParam: (key) => searchParams.get(key) ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, defaultSortDir, defaultPageSize, searchParams]
  );

  const hasActiveFilters =
    query.search !== "" || Object.keys(query.filters).length > 0;

  return { query, actions, hasActiveFilters };
}
