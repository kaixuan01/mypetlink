// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SocialOwnerCard,
  SocialPetCard,
  SocialSearchResults,
} from "@/services/socialDiscoveryService";

const mocks = vi.hoisted(() => ({
  searchSocial: vi.fn(),
  followOwner: vi.fn(),
  query: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

vi.mock("@/services/socialDiscoveryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialDiscoveryService")
  >("@/services/socialDiscoveryService");

  return {
    ...actual,
    searchSocial: (...args: unknown[]) => mocks.searchSocial(...args),
  };
});

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    followOwner: (...args: unknown[]) => mocks.followOwner(...args),
  };
});

import { SocialSearchView } from "@/components/social/SocialSearchView";

function pet(name: string, handle: string): SocialPetCard {
  return {
    name,
    species: "Cat",
    customSpecies: null,
    breed: "British Shorthair",
    publicSlug: `${name.toLowerCase()}-pub${name.toLowerCase()}`,
    photoThumbnailUrl: null,
    lostModeEnabled: false,
    owner: {
      handle,
      displayName: `The ${handle} Family`,
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    viewerFollowsOwner: false,
  };
}

function owner(handle: string): SocialOwnerCard {
  return {
    handle,
    displayName: `The ${handle} Family`,
    avatarThumbnailUrl: null,
    generalArea: "Petaling Jaya",
    viewerFollows: false,
    isSelf: false,
  };
}

function results(
  query: string,
  pets: SocialPetCard[],
  owners: SocialOwnerCard[]
): SocialSearchResults {
  return { query, pets, owners };
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Search pets or pet parents"), {
    target: { value },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.query = "";
  mocks.searchSocial.mockResolvedValue(
    results("moch", [pet("Mochi", "tanfamily")], [owner("mochiandcoco")])
  );
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("SocialSearchView", () => {
  it("calls the two tabs Pets and Pet Parents", () => {
    render(<SocialSearchView />);

    expect(screen.getByRole("button", { name: /^Pets/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Pet Parents/ })).toBeTruthy();

    // MyPetLink is pet-centric all the way down; these are pet parents, not
    // "People".
    expect(screen.queryByRole("button", { name: /^People/ })).toBeNull();
  });

  it("waits for two characters before asking the server anything", async () => {
    render(<SocialSearchView />);

    type("m");
    await vi.advanceTimersByTimeAsync(600);

    expect(mocks.searchSocial).not.toHaveBeenCalled();
    expect(screen.getByTestId("search-hint")).toBeTruthy();
  });

  it("searches once for a burst of typing", async () => {
    render(<SocialSearchView />);

    type("mo");
    type("moc");
    type("moch");
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => expect(mocks.searchSocial).toHaveBeenCalledTimes(1));
    expect(mocks.searchSocial.mock.calls[0][0]).toBe("moch");
  });

  it("abandons a search the typist has already moved past", async () => {
    // Typing outruns the network. Without cancellation a slow answer to "mo"
    // can arrive after the answer to "mochi" and overwrite it, which looks like
    // the results going backwards under your hands.
    const signals: AbortSignal[] = [];
    mocks.searchSocial.mockImplementation(
      (_query: string, _type: unknown, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise(() => {});
      }
    );

    render(<SocialSearchView />);

    type("mo");
    await vi.advanceTimersByTimeAsync(600);
    type("mochi");
    await vi.advanceTimersByTimeAsync(600);

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("shows matching pets first", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(600);

    const pets = await screen.findByTestId("search-pets");
    expect(within(pets).getByText("Mochi")).toBeTruthy();
  });

  it("shows matching pet parents on their own tab", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(600);
    await screen.findByTestId("search-pets");

    fireEvent.click(screen.getByRole("button", { name: /^Pet Parents/ }));

    const owners = await screen.findByTestId("search-owners");
    expect(within(owners).getByText("@mochiandcoco · Petaling Jaya")).toBeTruthy();
  });

  it("opens on the results when a search link is shared", async () => {
    mocks.query = "q=moch";

    render(<SocialSearchView />);
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() =>
      expect(mocks.searchSocial.mock.calls[0]?.[0]).toBe("moch")
    );
  });

  it("sends a result to the profile rather than acting on it in place", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(600);

    const petRow = await screen.findByTestId("search-pet-row");
    expect(petRow.getAttribute("href")).toBe("/p/mochi-pubmochi");

    fireEvent.click(screen.getByRole("button", { name: /^Pet Parents/ }));
    const ownerRow = await screen.findByTestId("search-owner-row");
    expect(ownerRow.getAttribute("href")).toBe("/u/mochiandcoco");

    // Follow is a decision, and a result row is not enough of a household to
    // make it on. It lives on the profile the row opens.
    expect(screen.queryByTestId("follow-button")).toBeNull();
    expect(screen.queryByTestId("follow-button-signin")).toBeNull();
  });

  it("shows only the social identity a household chose", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(600);
    await screen.findByTestId("search-pets");

    // A result names the pet, its type, and the handle that shares it. The
    // account name, the finder-facing owner name, an email, a phone number and
    // every code are all absent — they are not searchable and not shown.
    const row = screen.getByTestId("search-pet-row");
    expect(row.textContent).toContain("Mochi");
    expect(row.textContent).toContain("@tanfamily");
    expect(row.textContent).not.toMatch(/@.*\.(com|net|org)/);
    expect(row.textContent).not.toMatch(/\+?\d{7,}/);
    expect(row.textContent).not.toMatch(/MPL-|safetyCode|tagCode/i);
  });

  it("says plainly when nothing matches", async () => {
    mocks.searchSocial.mockResolvedValue(results("zzzz", [], []));

    render(<SocialSearchView />);

    type("zzzz");
    await vi.advanceTimersByTimeAsync(600);

    expect((await screen.findByTestId("search-pets-empty")).textContent).toBe(
      "No pets found"
    );
  });

  it("explains a failure without losing the box", async () => {
    mocks.searchSocial.mockRejectedValue(new Error("network"));

    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByTestId("search-error")).toBeTruthy();
    // The query survives: clearing it would make somebody retype what they
    // already typed to recover from a failure that was not theirs.
    expect(
      (screen.getByLabelText("Search pets or pet parents") as HTMLInputElement)
        .value
    ).toBe("moch");
  });

  it("says something useful when the search rate limit is hit", async () => {
    mocks.searchSocial.mockRejectedValue(
      Object.assign(new Error("rate limited"), { status: 429 })
    );

    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(600);

    const error = await screen.findByTestId("search-error");

    // Plain words about waiting, not a status code and not an exception.
    expect(error.textContent).toMatch(/wait a moment/i);
    expect(error.textContent).not.toMatch(/429|rate limit|error/i);
  });

  it("announces results politely rather than stealing focus", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(600);
    await screen.findByTestId("search-pets");

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live!.contains(screen.getByTestId("search-pets"))).toBe(true);
  });

  it("does not pull focus on a page somebody navigated to", () => {
    render(<SocialSearchView />);

    // The overlay autofocuses, because opening it is the act of asking to
    // search. Arriving at a URL is not, and grabbing focus here would throw a
    // phone keyboard up over the page before it had been read.
    expect(document.activeElement).not.toBe(
      screen.getByLabelText("Search pets or pet parents")
    );
  });
});
