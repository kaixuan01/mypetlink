// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  const push = vi.fn();
  return {
    replace,
    push,
    // Next's useRouter returns a stable reference across renders; mirror that so
    // the guard effect's [pathname, router, attempt] deps don't loop.
    router: { replace, push },
    isOwnerAuthenticated: vi.fn(),
    getCurrentOwnerSession: vi.fn(),
    getOwnerProfileSettings: vi.fn(),
    logoutOwner: vi.fn(),
    canUseApi: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => mocks.router,
}));
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ""} />;
  },
}));
vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: (...args: unknown[]) =>
    mocks.isOwnerAuthenticated(...args),
  getCurrentOwnerSession: (...args: unknown[]) =>
    mocks.getCurrentOwnerSession(...args),
  logoutOwner: (...args: unknown[]) => mocks.logoutOwner(...args),
}));
vi.mock("@/services/ownerProfileService", () => ({
  getOwnerProfileSettings: (...args: unknown[]) =>
    mocks.getOwnerProfileSettings(...args),
}));
vi.mock("@/services/apiConfig", () => ({
  canUseApi: (...args: unknown[]) => mocks.canUseApi(...args),
  getFrontendResilienceConfig: () => ({
    maxAttempts: 6,
    maximumWaitMs: 45_000,
  }),
}));

class FakeApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message = "failed") {
    super(message);
    this.status = status;
    this.code = `http_${status}`;
  }
}

vi.mock("@/services/apiClient", () => ({
  isApiClientError: (error: unknown) => error instanceof FakeApiError,
}));

const {
  AuthGuard,
  LOADER_DELAY_MS,
  SLOW_HINT_DELAY_MS,
  getSessionCheckTimeoutMs,
  resetOwnerSessionVerificationForTests,
} = await import("./AuthGuard");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderGuard() {
  return render(
    <AuthGuard>
      <p>Protected content</p>
    </AuthGuard>
  );
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetOwnerSessionVerificationForTests();
  mocks.replace.mockReset();
  mocks.logoutOwner.mockReset();
  mocks.isOwnerAuthenticated.mockReturnValue(true);
  mocks.canUseApi.mockReturnValue(true);
  mocks.getCurrentOwnerSession.mockReset();
  mocks.getOwnerProfileSettings.mockReset();
  mocks.getOwnerProfileSettings.mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // restoreAllMocks resets the navigator.onLine spy; clearAllMocks resets call
  // history on the module mocks (implementations are re-set in beforeEach).
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AuthGuard staged loading", () => {
  it("does not flash the loader when the check resolves quickly", async () => {
    mocks.getCurrentOwnerSession.mockResolvedValue({ user: {} });

    renderGuard();
    expect(screen.queryByText(/getting your account ready/i)).toBeNull();

    await flushMicrotasks();

    expect(screen.getByText("Protected content")).toBeTruthy();
    expect(screen.queryByText(/getting your account ready/i)).toBeNull();
  });

  it("shows the branded loader only after the short delay", async () => {
    const pending = deferred<{ user: object }>();
    mocks.getCurrentOwnerSession.mockReturnValue(pending.promise);

    renderGuard();
    await flushMicrotasks();
    expect(screen.queryByText(/getting your account ready/i)).toBeNull();

    await advance(LOADER_DELAY_MS + 10);

    expect(screen.getByText("Getting your account ready...")).toBeTruthy();
    expect(
      screen.getByText("Preparing your pet dashboard securely.")
    ).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");

    pending.resolve({ user: {} });
    await flushMicrotasks();
    expect(screen.getByText("Protected content")).toBeTruthy();
  });

  it("updates the secondary message when the check is slow", async () => {
    mocks.getCurrentOwnerSession.mockReturnValue(
      deferred<{ user: object }>().promise
    );

    renderGuard();
    await advance(SLOW_HINT_DELAY_MS + 10);

    expect(
      screen.getByText("This is taking a little longer than usual.")
    ).toBeTruthy();
  });

  it("replaces the infinite loader with a recoverable timeout state", async () => {
    mocks.getCurrentOwnerSession.mockReturnValue(
      deferred<{ user: object }>().promise
    );

    renderGuard();
    await advance(getSessionCheckTimeoutMs() + 10);

    expect(
      screen.getByText("We could not finish checking your session.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to sign in" })
        .getAttribute("href")
    ).toContain("/login?redirect=");
  });

  it("still opens the portal if the check succeeds after the timeout screen", async () => {
    const pending = deferred<{ user: object }>();
    mocks.getCurrentOwnerSession.mockReturnValue(pending.promise);

    renderGuard();
    await advance(getSessionCheckTimeoutMs() + 10);
    expect(
      screen.getByText("We could not finish checking your session.")
    ).toBeTruthy();

    pending.resolve({ user: {} });
    await flushMicrotasks();
    expect(screen.getByText("Protected content")).toBeTruthy();
  });
});

describe("AuthGuard failure handling", () => {
  it("redirects to login on 401 without showing an error state", async () => {
    mocks.getCurrentOwnerSession.mockRejectedValue(new FakeApiError(401));

    renderGuard();
    await flushMicrotasks();

    expect(mocks.logoutOwner).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("/login?redirect=")
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("reports a network failure as a connection problem, not an expired session", async () => {
    mocks.getCurrentOwnerSession.mockRejectedValue(new FakeApiError(0));

    renderGuard();
    await flushMicrotasks();

    expect(
      screen.getByText("MyPetLink is having trouble connecting right now.")
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/expired/i);
    expect(mocks.logoutOwner).not.toHaveBeenCalled();
  });

  it("shows the offline state when the browser reports no connectivity", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.getCurrentOwnerSession.mockRejectedValue(new FakeApiError(0));

    renderGuard();
    await flushMicrotasks();

    expect(screen.getByText("You appear to be offline.")).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again.")
    ).toBeTruthy();
  });

  it("re-runs the session check when Retry is pressed and blocks double submits", async () => {
    mocks.getCurrentOwnerSession.mockRejectedValueOnce(new FakeApiError(503));
    mocks.getCurrentOwnerSession.mockResolvedValue({ user: {} });

    renderGuard();
    await flushMicrotasks();

    const retry = screen.getByRole("button", { name: "Retry" });
    // Two rapid clicks must trigger only one new validation cycle.
    fireEvent.click(retry);
    fireEvent.click(retry);

    await flushMicrotasks();
    expect(screen.getByText("Protected content")).toBeTruthy();
    expect(mocks.getCurrentOwnerSession).toHaveBeenCalledTimes(2);
  });

  it("redirects unauthenticated visitors to login", async () => {
    mocks.isOwnerAuthenticated.mockReturnValue(false);

    renderGuard();
    await flushMicrotasks();

    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("/login?redirect=")
    );
    expect(mocks.getCurrentOwnerSession).not.toHaveBeenCalled();
  });
});

describe("AuthGuard lifecycle", () => {
  it("clears timers and ignores late results after unmount", async () => {
    const pending = deferred<{ user: object }>();
    mocks.getCurrentOwnerSession.mockReturnValue(pending.promise);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = renderGuard();
    await advance(LOADER_DELAY_MS + 10);
    unmount();

    pending.resolve({ user: {} });
    await flushMicrotasks();
    await advance(getSessionCheckTimeoutMs());

    // No setState-after-unmount warnings and no crash.
    expect(
      errorSpy.mock.calls.filter(([message]) =>
        String(message).includes("unmounted")
      )
    ).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("skips the blocking loader on remount after a verified session", async () => {
    mocks.getCurrentOwnerSession.mockResolvedValue({ user: {} });

    const first = renderGuard();
    await flushMicrotasks();
    expect(screen.getByText("Protected content")).toBeTruthy();
    first.unmount();

    // Second mount (in-portal navigation) renders immediately from the
    // verified fast path while revalidating in the background.
    renderGuard();
    await flushMicrotasks();
    expect(screen.getByText("Protected content")).toBeTruthy();
    expect(screen.queryByText(/getting your account ready/i)).toBeNull();
  });

  it("signs out when background revalidation returns 401", async () => {
    mocks.getCurrentOwnerSession.mockResolvedValueOnce({ user: {} });

    const first = renderGuard();
    await flushMicrotasks();
    first.unmount();

    mocks.getCurrentOwnerSession.mockRejectedValueOnce(new FakeApiError(401));
    renderGuard();
    await flushMicrotasks();

    expect(mocks.logoutOwner).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("/login?redirect=")
    );
  });
});
