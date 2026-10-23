// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installHeldFetch,
  SESSION_STORAGE_KEY,
  sessionChangedInAnotherTab,
  storedSession,
} from "@/services/sessionTestFetch";
import { resetUnreadActivityCache, useUnreadActivity } from "./useUnreadActivity";

// The real badge cache, API client and session storage; only the network is
// held so answers can arrive after the sign-in they were asked for has ended.

let held: ReturnType<typeof installHeldFetch>;
let testRun = 0;

function Badge() {
  return <span data-testid="badge">{useUnreadActivity(true)}</span>;
}

async function settle() {
  await act(async () => {
    for (let index = 0; index < 10; index++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const unreadRequests = () =>
  held.requests.filter((request) => request.url.includes("/social/notifications/unread"));

function session(userId: string, sessionId: string) {
  return storedSession(userId, { sessionId: `${sessionId}-${testRun}` });
}

beforeEach(() => {
  testRun += 1;
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test");
  window.localStorage.clear();
  resetUnreadActivityCache();
  held = installHeldFetch();
  vi.stubGlobal("fetch", held.fetchImpl);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the Activity badge belongs to one sign-in", () => {
  it("does not seed the next account's badge with the previous account's count", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    const first = render(<Badge />);
    await settle();
    unreadRequests()[0].answer(200, { data: { unreadCount: 7 } });
    await settle();
    expect(screen.getByTestId("badge").textContent).toBe("7");
    first.unmount();

    // Inside the 60-second freshness window, a different account signs in.
    sessionChangedInAnotherTab(session("owner-b", "b"));
    render(<Badge />);
    expect(screen.getByTestId("badge").textContent).toBe("0");
    await settle();
    expect(unreadRequests()).toHaveLength(2);
    expect(unreadRequests()[1].authorization).toContain("owner-b");
  });

  it("does not publish an answer that arrives after its sign-in ended", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    render(<Badge />);
    await settle();

    sessionChangedInAnotherTab(session("owner-b", "b"));
    await settle();
    unreadRequests()[0].answer(200, { data: { unreadCount: 9 } });
    await settle();

    expect(screen.getByTestId("badge").textContent).toBe("0");
  });

  it("clears the badge on sign-out", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    render(<Badge />);
    await settle();
    unreadRequests()[0].answer(200, { data: { unreadCount: 4 } });
    await settle();
    expect(screen.getByTestId("badge").textContent).toBe("4");

    sessionChangedInAnotherTab(null);
    await settle();
    expect(screen.getByTestId("badge").textContent).toBe("0");
  });

  it("still shares one read between badges within a sign-in", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    render(
      <>
        <Badge />
        <Badge />
      </>
    );
    await settle();
    expect(unreadRequests()).toHaveLength(1);
  });
});
