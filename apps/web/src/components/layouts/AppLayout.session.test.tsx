// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installHeldFetch,
  SESSION_STORAGE_KEY,
  sessionChangedInAnotherTab,
  storedSession,
} from "@/services/sessionTestFetch";

// The complete portal shell — the real AppLayout inside the real AuthGuard,
// with the real auth, owner-profile and session services. Only routing and
// the network are stand-ins.
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), pathname: "/recap" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
}));

const { AppLayout } = await import("./AppLayout");
const { resetOwnerSessionVerificationForTests, SIGN_OUT_SETTLE_MS } = await import("@/components/auth/AuthGuard");
const { clearStoredAuthSession } = await import("@/services/authStorage");

const OWNER_NAME = "Private Finder Identity";
let held: ReturnType<typeof installHeldFetch>;
let testRun = 0;

async function flush() {
  for (let index = 0; index < 6; index++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function profile(displayName: string) {
  return {
    userId: "u",
    ownerProfileId: "op",
    displayName,
    email: "owner@example.test",
    phoneE164: "+60123456789",
    whatsappE164: null,
    defaultGeneralArea: null,
    defaultContact: { displayName },
    defaultPrivacy: "Private",
    notificationPreferences: {},
    marketingEmailOptIn: false,
    planCode: "free",
  };
}

/** Answers the guard's session check for whoever is signed in. */
async function answerSessionCheck(userId: string, displayName: string) {
  await flush();
  for (const request of held.requests.splice(0)) {
    if (request.url.endsWith("/api/v1/auth/me")) {
      request.answer(200, {
        data: {
          user: { id: userId, email: `${userId}@example.test`, displayName: "Account", roles: ["Owner"], status: "Active" },
          ownerProfile: { ownerDisplayName: displayName },
        },
      });
    } else if (request.url.endsWith("/api/v1/owner/profile")) {
      request.answer(200, { data: profile(displayName) });
    } else if (request.url.endsWith("/api/v1/auth/owner-portal-entry")) {
      request.answer(204);
    }
  }
  await flush();
}

function signIn(userId: string, sessionId: string) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, storedSession(userId, { sessionId: `${sessionId}-${testRun}` }));
}

async function openPortal(collapsed = false) {
  window.localStorage.setItem("mypetlink_sidebar_collapsed", collapsed ? "true" : "false");
  render(
    <AppLayout>
      <p>Private page content</p>
    </AppLayout>
  );
  await answerSessionCheck("owner-a", OWNER_NAME);
  expect(screen.getByText("Private page content")).toBeTruthy();
}

function ownerIdentityShown() {
  const text = document.body.textContent ?? "";
  const titled = [...document.querySelectorAll("[title]")].some((node) =>
    (node.getAttribute("title") ?? "").includes(OWNER_NAME)
  );
  return text.includes(OWNER_NAME) || titled;
}

/** Nothing private on screen at once; the trip to sign-in follows once the sign-out settles. */
async function expectSignedOutShell() {
  expect(ownerIdentityShown()).toBe(false);
  expect(screen.queryByText("Private page content")).toBeNull();
  expect(window.localStorage.getItem("mypetlink_owner_settings") ?? "").not.toContain(OWNER_NAME);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SIGN_OUT_SETTLE_MS + 20));
  });
  expect(nav.replace).toHaveBeenCalledWith(expect.stringContaining("/login"));
}

beforeEach(() => {
  testRun += 1;
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test");
  window.localStorage.clear();
  window.history.replaceState({}, "", "/recap");
  nav.replace.mockReset();
  held = installHeldFetch();
  vi.stubGlobal("fetch", held.fetchImpl);
  resetOwnerSessionVerificationForTests();
  signIn("owner-a", "a");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the portal shell when the session ends", () => {
  it("shows the owner's name while signed in (control)", async () => {
    await openPortal();
    expect(ownerIdentityShown()).toBe(true);
  });

  it("removes the owner's name and the page when another tab signs out", async () => {
    await openPortal();

    await act(async () => sessionChangedInAnotherTab(null));
    await flush();

    await expectSignedOutShell();
  });

  it("removes them when this tab's session is cleared (a failed token refresh)", async () => {
    await openPortal();

    await act(async () => clearStoredAuthSession());
    await flush();

    await expectSignedOutShell();
  });

  it("clears the collapsed avatar and its title too", async () => {
    await openPortal(true);
    expect(ownerIdentityShown()).toBe(true);

    await act(async () => sessionChangedInAnotherTab(null));
    await flush();

    await expectSignedOutShell();
  });

  it("never shows account A's identity once account B has signed in, before or after B is checked", async () => {
    await openPortal();

    await act(async () => sessionChangedInAnotherTab(storedSession("owner-b", { sessionId: `b-${testRun}` })));
    await flush();
    expect(ownerIdentityShown()).toBe(false);
    expect(screen.queryByText("Private page content")).toBeNull();

    await answerSessionCheck("owner-b", "Owner B Name");
    expect(ownerIdentityShown()).toBe(false);
    expect(screen.getByText("Owner B Name")).toBeTruthy();
    expect(screen.getByText("Private page content")).toBeTruthy();
  });

  it("does not let a late owner-profile answer from the ended session restore the name", async () => {
    window.localStorage.setItem("mypetlink_sidebar_collapsed", "false");
    render(
      <AppLayout>
        <p>Private page content</p>
      </AppLayout>
    );
    await flush();
    const profileRequest = held.requests.find((request) => request.url.endsWith("/api/v1/owner/profile"));
    expect(profileRequest).toBeDefined();

    await act(async () => sessionChangedInAnotherTab(null));
    await flush();
    profileRequest!.answer(200, { data: profile(OWNER_NAME) });
    await flush();

    expect(ownerIdentityShown()).toBe(false);
    expect(window.localStorage.getItem("mypetlink_owner_settings") ?? "").not.toContain(OWNER_NAME);
  });

  it("treats a sign-out and sign-in queued together as a new session, not a trip to sign-in", async () => {
    await openPortal();
    const previous = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const next = storedSession("owner-a", { sessionId: `a-again-${testRun}` });

    // Another tab signed out and straight back in. As in a real browser, the
    // sign-out is reported first and the sign-in a moment later.
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: SESSION_STORAGE_KEY, oldValue: previous, newValue: null }));
    });
    await flush();
    expect(screen.queryByText("Private page content")).toBeNull();
    window.localStorage.setItem(SESSION_STORAGE_KEY, next);
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: SESSION_STORAGE_KEY, oldValue: null, newValue: next }));
    });
    await flush();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SIGN_OUT_SETTLE_MS + 20));
    });

    // The old session's portal is gone and its details forgotten at once...
    expect(screen.queryByText("Private page content")).toBeNull();
    expect(window.localStorage.getItem("mypetlink_owner_settings") ?? "").not.toContain(OWNER_NAME);
    expect(nav.replace).not.toHaveBeenCalled();

    // ...and the new sign-in is confirmed afresh before the portal reopens.
    const checks = held.requests.filter((request) => request.url.endsWith("/api/v1/auth/me"));
    expect(checks.length).toBeGreaterThan(0);
    await answerSessionCheck("owner-a", OWNER_NAME);
    expect(screen.getByText("Private page content")).toBeTruthy();
  });

  it("keeps the shell through an ordinary token refresh in the same session", async () => {
    await openPortal();
    const session = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY)!);

    await act(async () =>
      sessionChangedInAnotherTab(JSON.stringify({ ...session, accessToken: "rotated", refreshToken: "rotated-r" }))
    );
    await flush();

    expect(ownerIdentityShown()).toBe(true);
    expect(screen.getByText("Private page content")).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(held.requests.filter((request) => request.url.endsWith("/api/v1/auth/me"))).toHaveLength(0);
  });
});
