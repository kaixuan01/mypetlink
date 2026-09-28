// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Search, from the box to the request that leaves the browser.
 *
 * Only `apiRequest` is replaced — the search box, `searchSocial` and the URL it
 * builds are the real ones. The stand-in API applies the server's rule
 * (`SocialSearchQuery.Normalize`: one leading "@", then trim) exactly once to
 * whatever arrives, like the real endpoint does. A client that also normalized
 * would apply it twice, and "@@tanfamily" would come back as a match — which
 * is how the defect shipped while each half was tested on its own.
 */

const HANDLES = ["tanfamily", "limfamily"];

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>(
    "@/services/apiClient"
  );
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
  };
});

import { SocialSearchView } from "@/components/social/SocialSearchView";

/** The server's rule, applied once, to what the server received. */
function serverNormalize(query: string) {
  const term = query.trim();
  return term.startsWith("@") ? term.slice(1).trimStart() : term;
}

function fakeSearchApi(path: string) {
  const url = new URL(path, "http://api.test");
  const received = url.searchParams.get("q") ?? "";
  const term = serverNormalize(received);
  const owners =
    term.length < 2
      ? []
      : HANDLES.filter((handle) => handle.startsWith(term.toLowerCase())).map(
          (handle) => ({
            handle,
            displayName: `The ${handle}`,
            avatarThumbnailUrl: null,
            generalArea: null,
            viewerFollows: false,
            isSelf: false,
          })
        );
  return Promise.resolve({ data: { query: term, pets: [], owners } });
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Search pets or pet parents"), {
    target: { value },
  });
}

function sentQueries() {
  return mocks.apiRequest.mock.calls.map(([path]) =>
    new URL(path as string, "http://api.test").searchParams.get("q")
  );
}

async function ownersFor(typed: string) {
  render(<SocialSearchView />);
  type(typed);
  await vi.advanceTimersByTimeAsync(600);
  await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: /^Pet Parents/ }));
  await waitFor(() =>
    expect(
      screen.queryByTestId("search-owners") ?? screen.queryByTestId("search-owners-empty")
    ).toBeTruthy()
  );
  return screen
    .queryAllByTestId("search-owner-row")
    .map((row) => row.getAttribute("href"));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.apiRequest.mockImplementation((path: string) => fakeSearchApi(path));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("search, across the request boundary", () => {
  it.each([
    ["tanfamily", "tanfamily"],
    ["@tanfamily", "@tanfamily"],
    ["@ tanfamily", "@ tanfamily"],
    ["@TanFamily", "@TanFamily"],
    ["   @tanfamily", "@tanfamily"],
    ["@tanfamily   ", "@tanfamily"],
    ["@@tanfamily", "@@tanfamily"],
    ["@ @tanfamily", "@ @tanfamily"],
    ["@ab", "@ab"],
  ])("sends %j to the API as %j, never pre-normalized", async (typed, sent) => {
    render(<SocialSearchView />);
    type(typed);
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    expect(sentQueries()).toEqual([sent]);
  });

  it.each(["@", "@a", "  @a  ", "a"])(
    "does not send %j: under two characters once the @ is set aside",
    async (typed) => {
      render(<SocialSearchView />);
      type(typed);
      await vi.advanceTimersByTimeAsync(600);

      expect(mocks.apiRequest).not.toHaveBeenCalled();
      expect(screen.getByTestId("search-hint")).toBeTruthy();
    }
  );

  it.each([
    ["tanfamily", ["/u/tanfamily"]],
    ["@tanfamily", ["/u/tanfamily"]],
    ["@ tanfamily", ["/u/tanfamily"]],
    ["@TANFAM", ["/u/tanfamily"]],
    ["  @tan  ", ["/u/tanfamily"]],
    ["@ab", []],
    // Malformed doubled prefixes stay malformed: the server strips one "@" and
    // nothing matches. Only a second strip in the client could make them match.
    ["@@tanfamily", []],
    ["@ @tanfamily", []],
  ])("finds exactly what the API finds for %j", async (typed, expected) => {
    expect(await ownersFor(typed)).toEqual(expected);
  });

  it("sends one request for one query", async () => {
    render(<SocialSearchView />);
    type("@tan");
    type("@tanf");
    type("@tanfa");
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(600);
    expect(sentQueries()).toEqual(["@tanfa"]);
  });
});
