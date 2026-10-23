// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installHeldFetch,
  SESSION_STORAGE_KEY,
  sessionChangedInAnotherTab,
  storedSession,
  type HeldRequest,
} from "@/services/sessionTestFetch";

// Who a portal check belongs to. The real AppLayout inside the real AuthGuard,
// with the real auth, owner-profile and session services; only routing and
// the network are stand-ins. Sessions are written as another tab writes them,
// and their notifications can be held back, as a busy browser does.
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
}));

const { AppLayout } = await import("./AppLayout");
const { resetOwnerSessionVerificationForTests, SIGN_OUT_SETTLE_MS } = await import("@/components/auth/AuthGuard");

const A_NAME = "Owner A Secret";
const A_PHONE = "+60111111111";
const B_NAME = "Owner B Name";
let held: ReturnType<typeof installHeldFetch>;
let testRun = 0;

async function flush() {
  for (let index = 0; index < 6; index++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SIGN_OUT_SETTLE_MS + 20));
  });
  await flush();
}

const session = (userId: string, sessionId: string) => storedSession(userId, { sessionId: `${sessionId}-${testRun}` });
const tokenOf = (userId: string, sessionId: string) => `Bearer access-${userId}-${sessionId}-${testRun}`;

function profile(displayName: string, phone: string) {
  return {
    userId: "u",
    ownerProfileId: "op",
    displayName,
    email: "owner@example.test",
    phoneE164: phone,
    whatsappE164: null,
    defaultGeneralArea: null,
    defaultContact: { displayName },
    defaultPrivacy: "Private",
    notificationPreferences: {},
    marketingEmailOptIn: false,
    planCode: "free",
  };
}

/** Takes the portal checks made with one token, so the test answers them when it chooses. */
function checksFor(token: string) {
  const mine: HeldRequest[] = [];
  for (let index = held.requests.length - 1; index >= 0; index--) {
    if (held.requests[index].authorization === token) mine.unshift(...held.requests.splice(index, 1));
  }
  return mine;
}

function answerOk(requests: HeldRequest[], userId: string, displayName: string, phone: string) {
  for (const request of requests) {
    if (request.url.endsWith("/api/v1/auth/me")) {
      request.answer(200, {
        data: {
          user: { id: userId, email: `${userId}@example.test`, displayName: "Account", roles: ["Owner"], status: "Active" },
          ownerProfile: { ownerDisplayName: displayName },
        },
      });
    } else if (request.url.endsWith("/api/v1/owner/profile")) {
      request.answer(200, { data: profile(displayName, phone) });
    } else if (request.url.endsWith("/api/v1/auth/owner-portal-entry")) {
      request.answer(204);
    } else {
      request.answer(200, { data: [] });
    }
  }
}

function answerStatus(requests: HeldRequest[], status: number) {
  for (const request of requests) request.answer(status, { error: { code: "unauthorized", message: "Sign in" } });
}

function portal() {
  return render(
    <AppLayout>
      <p>Private page content</p>
    </AppLayout>
  );
}

/** Anything of account A on screen or in the owner details the portal reads. */
function aShown() {
  const html = document.body.innerHTML;
  return html.includes(A_NAME) || html.includes(A_PHONE);
}
const pageShown = () => screen.queryByText("Private page content") !== null;
const storedUser = () => {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  return raw ? (JSON.parse(raw).user.id as string) : null;
};

async function enterAsA() {
  window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
  const view = portal();
  await flush();
  answerOk(checksFor(tokenOf("owner-a", "a")), "owner-a", A_NAME, A_PHONE);
  await flush();
  expect(screen.getByText(A_NAME)).toBeTruthy();
  expect(pageShown()).toBe(true);
  return view;
}

beforeEach(() => {
  testRun += 1;
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test");
  window.localStorage.clear();
  window.localStorage.setItem("mypetlink_sidebar_collapsed", "false");
  nav.replace.mockReset();
  held = installHeldFetch();
  vi.stubGlobal("fetch", held.fetchImpl);
  resetOwnerSessionVerificationForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("B1: a verification belongs to the sign-in it checked", () => {
  it("A verified, a public page, B signs in elsewhere, back to the portal: nothing of A, and B only once verified", async () => {
    const view = await enterAsA();
    view.unmount(); // a public page: no guard mounted

    sessionChangedInAnotherTab(session("owner-b", "b"));
    portal();
    await flush();

    // B's checks are on their way; A's cached owner details are still stored.
    const bChecks = checksFor(tokenOf("owner-b", "b"));
    expect(bChecks.length).toBeGreaterThan(0);
    expect(pageShown()).toBe(false);
    expect(aShown()).toBe(false);
    // A's cached name and number are not just hidden: they are gone.
    const cached = window.localStorage.getItem("mypetlink_owner_settings") ?? "";
    expect(cached).not.toContain(A_NAME);
    expect(cached).not.toContain(A_PHONE);

    answerOk(bChecks, "owner-b", B_NAME, "+60122222222");
    await flush();
    expect(pageShown()).toBe(true);
    expect(screen.getByText(B_NAME)).toBeTruthy();
    expect(aShown()).toBe(false);
  });

  it("when B's verification fails, no private portal is shown", async () => {
    const view = await enterAsA();
    view.unmount();

    sessionChangedInAnotherTab(session("owner-b", "b"));
    portal();
    await flush();
    answerStatus(checksFor(tokenOf("owner-b", "b")), 401);
    await flush();
    // The token refresh the client tries for B is refused too.
    answerStatus(held.requests.splice(0), 401);
    await flush();

    expect(pageShown()).toBe(false);
    expect(aShown()).toBe(false);
    expect(storedUser()).toBeNull();
    // The ended sign-in goes to sign-in once the sign-out has settled.
    await settle();
    expect(nav.replace).toHaveBeenCalledWith(expect.stringContaining("/login"));
  });

  it("an old pending check for A cannot bring A back after B signed in", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    const view = portal();
    await flush();
    const aChecks = checksFor(tokenOf("owner-a", "a"));
    view.unmount();

    sessionChangedInAnotherTab(session("owner-b", "b"));
    portal();
    await flush();
    answerOk(aChecks, "owner-a", A_NAME, A_PHONE);
    await flush();
    expect(pageShown()).toBe(false);
    expect(aShown()).toBe(false);

    answerOk(checksFor(tokenOf("owner-b", "b")), "owner-b", B_NAME, "+60122222222");
    await flush();
    expect(screen.getByText(B_NAME)).toBeTruthy();
    expect(aShown()).toBe(false);
    expect(storedUser()).toBe("owner-b");
  });

  it("keeps the fast path for ordinary navigation within one sign-in", async () => {
    const view = await enterAsA();
    view.unmount();

    portal();
    await flush();
    // Rendered at once; the background check is still on its way.
    expect(pageShown()).toBe(true);
    expect(screen.getByText(A_NAME)).toBeTruthy();
  });

  it("keeps verification through an ordinary token refresh", async () => {
    const view = await enterAsA();
    view.unmount();

    const current = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY)!);
    sessionChangedInAnotherTab(JSON.stringify({ ...current, accessToken: "rotated", refreshToken: "rotated-r" }));
    portal();
    await flush();
    expect(pageShown()).toBe(true);
    expect(screen.getByText(A_NAME)).toBeTruthy();
  });
});

describe("B2: a retired check never acts on the next sign-in", () => {
  it("A signs out, B is stored but not yet announced, A's old check answers: B stays signed in and is verified", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    portal();
    await flush();
    const aChecks = checksFor(tokenOf("owner-a", "a"));

    sessionChangedInAnotherTab(null);
    await flush();
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-b", "b")); // notification held back
    answerOk(aChecks, "owner-a", A_NAME, A_PHONE); // the services reject it as session_changed
    await flush();
    expect(storedUser()).toBe("owner-b");
    expect(pageShown()).toBe(false);

    await settle();
    answerOk(checksFor(tokenOf("owner-b", "b")), "owner-b", B_NAME, "+60122222222");
    await flush();
    expect(storedUser()).toBe("owner-b");
    expect(screen.getByText(B_NAME)).toBeTruthy();
    expect(aShown()).toBe(false);
  });

  it("a 401 for A while B's notification is held back does not sign B out", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    portal();
    await flush();
    const aChecks = checksFor(tokenOf("owner-a", "a"));

    sessionChangedInAnotherTab(null);
    await flush();
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-b", "b"));
    answerStatus(aChecks, 401);
    await flush();
    // Anything the client tries on A's behalf is refused as well.
    answerStatus(checksFor(tokenOf("owner-a", "a")), 401);
    await flush();

    expect(storedUser()).toBe("owner-b");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("A's old success after B signed in (B not yet announced) changes nothing for B", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    portal();
    await flush();
    const aChecks = checksFor(tokenOf("owner-a", "a"));

    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-b", "b")); // no notification yet
    answerOk(aChecks, "owner-a", A_NAME, A_PHONE);
    await flush();
    expect(storedUser()).toBe("owner-b");
    expect(pageShown()).toBe(false);
    expect(aShown()).toBe(false);

    const previous = session("owner-a", "a");
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: SESSION_STORAGE_KEY, oldValue: previous, newValue: window.localStorage.getItem(SESSION_STORAGE_KEY) }));
    });
    await flush();
    answerOk(checksFor(tokenOf("owner-b", "b")), "owner-b", B_NAME, "+60122222222");
    await flush();
    expect(screen.getByText(B_NAME)).toBeTruthy();
    expect(storedUser()).toBe("owner-b");
  });

  it("A's and B's checks answering in reverse order leave only B", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    portal();
    await flush();
    const aChecks = checksFor(tokenOf("owner-a", "a"));

    sessionChangedInAnotherTab(session("owner-b", "b"));
    await flush();
    answerOk(checksFor(tokenOf("owner-b", "b")), "owner-b", B_NAME, "+60122222222");
    await flush();
    expect(screen.getByText(B_NAME)).toBeTruthy();

    answerOk(aChecks, "owner-a", A_NAME, A_PHONE);
    await flush();
    expect(screen.getByText(B_NAME)).toBeTruthy();
    expect(aShown()).toBe(false);
    expect(storedUser()).toBe("owner-b");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("an ordinary 401 for the current sign-in still signs out", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    portal();
    await flush();
    answerStatus(checksFor(tokenOf("owner-a", "a")), 401);
    await flush();
    answerStatus(held.requests.splice(0), 401); // the refresh is refused
    await flush();

    expect(storedUser()).toBeNull();
    expect(pageShown()).toBe(false);
    await settle();
    expect(nav.replace).toHaveBeenCalledWith(expect.stringContaining("/login"));
  });

  it("a check still on its way when the portal closes does nothing when it answers", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, session("owner-a", "a"));
    const view = portal();
    await flush();
    const aChecks = checksFor(tokenOf("owner-a", "a"));
    view.unmount();

    answerOk(aChecks, "owner-a", A_NAME, A_PHONE);
    await flush();
    expect(storedUser()).toBe("owner-a");

    // Its answer did not count as a verification: the next portal checks first.
    portal();
    await flush();
    expect(pageShown()).toBe(false);
    answerOk(checksFor(tokenOf("owner-a", "a")), "owner-a", A_NAME, A_PHONE);
    await flush();
    expect(pageShown()).toBe(true);
  });

  it("repeated account switching ends with only the last sign-in", async () => {
    await enterAsA();
    sessionChangedInAnotherTab(session("owner-b", "b"));
    await flush();
    sessionChangedInAnotherTab(session("owner-a", "a2"));
    await flush();
    sessionChangedInAnotherTab(session("owner-b", "b2"));
    await flush();

    // Earlier checks answer late and in any order; only the last is honoured.
    answerOk(checksFor(tokenOf("owner-a", "a2")), "owner-a", A_NAME, A_PHONE);
    answerOk(checksFor(tokenOf("owner-b", "b")), "owner-b", B_NAME, "+60122222222");
    await flush();
    expect(pageShown()).toBe(false);
    expect(aShown()).toBe(false);

    answerOk(checksFor(tokenOf("owner-b", "b2")), "owner-b", B_NAME, "+60122222222");
    await flush();
    expect(screen.getByText(B_NAME)).toBeTruthy();
    expect(aShown()).toBe(false);
    expect(storedUser()).toBe("owner-b");
  });
});
