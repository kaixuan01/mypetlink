"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  SessionCheckingScreen,
  type SessionCheckState,
} from "@/components/auth/SessionCheckingScreen";
import {
  enterOwnerPortal,
  getCurrentOwnerSession,
  isOwnerAuthenticated,
  logoutOwner,
} from "@/services/authService";
import { canUseApi, getFrontendResilienceConfig } from "@/services/apiConfig";
import { isApiClientError, SESSION_CHANGED_CODE } from "@/services/apiClient";
import { getOwnerProfileSettings } from "@/services/ownerProfileService";
import {
  getAuthSessionKey,
  isAuthSessionCurrent,
  subscribeAuthSession,
  type AuthSessionKey,
} from "@/services/authStorage";
import {
  clearOwnerSettings,
  forgetOwnerSettingsOfOtherSessions,
} from "@/lib/ownerSettings";
import {
  getCurrentLocalDestination,
  ownerLoginPath,
} from "@/lib/authRedirect";

// Development builds only; inlined by Next at build time so it is always false
// in the production bundle. Used to gate a developer-only hint.
const isDevelopment = process.env.NODE_ENV === "development";

// Staged loading behaviour. A check that finishes inside LOADER_DELAY_MS never
// shows the loader at all (no flash on fast navigations); a check still running
// at SLOW_HINT_DELAY_MS switches to the "taking longer than usual" hint.
export const LOADER_DELAY_MS = 250;
export const SLOW_HINT_DELAY_MS = 5000;

// How long a sign-out waits before going to sign-in, so that a sign-in made
// straight after it in another tab (the same person signing out and back in)
// can still arrive and be confirmed instead. Nothing private waits: the portal
// is replaced the moment the sign-out is reported; only the navigation waits.
export const SIGN_OUT_SETTLE_MS = 250;

// The session request itself can legitimately take up to the database wake-up
// retry window (serverless SQL warming up), so the guard timeout must sit
// safely beyond it — never racing a legitimate token refresh or wake retry.
export function getSessionCheckTimeoutMs() {
  return getFrontendResilienceConfig().maximumWaitMs + 15_000;
}

// The sign-in that was last verified against the API in this app load. While
// that same sign-in is stored, remounting the guard (every in-portal navigation
// remounts the page tree) renders the destination immediately and revalidates
// in the background instead of blocking the whole portal behind a repeat
// check. It is the session key, not a yes/no: another account, or the same
// person signing in again, has a different key and is checked first, even if
// the change happened while no guard was mounted (on a public page). A token
// refresh keeps the key. A full reload (new module instance) always
// re-verifies first.
let verifiedSessionKey: AuthSessionKey | null = null;

export function resetOwnerSessionVerificationForTests() {
  verifiedSessionKey = null;
}

type GuardStatus = "ready" | SessionCheckState;

function isConnectionFailure(status: number) {
  return status === 0 || (status >= 500 && status <= 599);
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<GuardStatus>("waiting");
  const [errorDetail, setErrorDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Blocks duplicate Retry submissions between click and state update.
  const retryLockRef = useRef(false);
  const pathnameRef = useRef(pathname);
  // Bumped at every sign-in change, so a check started before it is retired at
  // once, before its answer arrives, whatever that answer is.
  const generationRef = useRef(0);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // The sign-in changed: signed out here or in another tab, a token refresh
  // that failed, or another account (or the same person again) signed in.
  // Nothing of the old session may stay on screen, so the whole portal —
  // shell, sidebar, owner name and avatar included — is replaced by the
  // neutral checking screen at once, and the cached owner details are
  // dropped. A sign-out goes to sign-in; a new sign-in is confirmed afresh
  // before the portal opens for it. A token refresh is not a change.
  //
  // Changes are reported one at a time, and another tab's sign-in can follow
  // its sign-out by a moment. So a sign-out goes to sign-in only once it has
  // settled and nobody is signed in by then: when the same person (or anyone)
  // signed straight back in, the sign-out has still retired everything above,
  // and the newer sign-in is confirmed instead of being sent to sign-in.
  useEffect(() => {
    let pendingSignOut: number | null = null;
    const cancelPendingSignOut = () => {
      if (pendingSignOut !== null) {
        window.clearTimeout(pendingSignOut);
        pendingSignOut = null;
      }
    };

    const unsubscribe = subscribeAuthSession((change) => {
      cancelPendingSignOut();
      generationRef.current += 1;
      verifiedSessionKey = null;
      if (canUseApi()) {
        clearOwnerSettings();
      }
      setErrorDetail("");
      setStatus("waiting");

      if (change.next === null) {
        pendingSignOut = window.setTimeout(() => {
          pendingSignOut = null;
          if (getAuthSessionKey() === null) {
            router.replace(
              ownerLoginPath(getCurrentLocalDestination(pathnameRef.current))
            );
          } else {
            setAttempt((current) => current + 1);
          }
        }, SIGN_OUT_SETTLE_MS);
        return;
      }

      // Re-run the session check for the new sign-in; the previous check, if
      // still on its way, is retired by the effect cleanup.
      setAttempt((current) => current + 1);
    });

    return () => {
      unsubscribe();
      cancelPendingSignOut();
    };
  }, [router]);

  useEffect(() => {
    const returnTo = getCurrentLocalDestination(pathname);

    if (!isOwnerAuthenticated()) {
      router.replace(ownerLoginPath(returnTo));
      return;
    }

    if (!canUseApi()) {
      // Local/mock mode has no session endpoint to confirm against.
      const timer = window.setTimeout(() => setStatus("ready"), 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    const timers: number[] = [];
    // The sign-in this check is for. Every effect of its answer — signing
    // out, redirecting, opening the portal, recording it as verified, even a
    // loading or error screen — happens only while that sign-in is still the
    // stored one and no sign-in change has been reported since it started.
    // Otherwise the answer belongs to a session that has ended and is
    // ignored; the newer sign-in is checked on its own.
    const sessionKey = getAuthSessionKey();
    const generation = generationRef.current;
    const stillCurrent = () =>
      active &&
      generationRef.current === generation &&
      isAuthSessionCurrent(sessionKey);

    // Owner details left by another sign-in (one that changed while no guard
    // was mounted) go now, before anything of this sign-in is shown.
    forgetOwnerSettingsOfOtherSessions();

    function schedule(delayMs: number, run: () => void) {
      timers.push(
        window.setTimeout(() => {
          if (stillCurrent()) {
            run();
          }
        }, delayMs)
      );
    }

    function clearStageTimers() {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      timers.length = 0;
    }

    /** Whether the check was refused because its sign-in has already ended. */
    function sessionEnded(caught: unknown) {
      return isApiClientError(caught) && caught.code === SESSION_CHANGED_CODE;
    }

    /** A 401 for the sign-in that is still stored: sign it out. */
    function signOutCurrent() {
      verifiedSessionKey = null;
      logoutOwner();
      router.replace(ownerLoginPath(returnTo));
    }

    function settleFailure(caught: unknown) {
      if (!stillCurrent() || sessionEnded(caught)) {
        return;
      }

      const failureStatus = isApiClientError(caught) ? caught.status : -1;

      if (failureStatus === 401) {
        signOutCurrent();
        return;
      }

      // navigator.onLine is a hint only: it distinguishes the copy shown for a
      // network-level failure, never the auth outcome itself.
      if (
        failureStatus === 0 &&
        typeof navigator !== "undefined" &&
        navigator.onLine === false
      ) {
        setStatus("offline");
        return;
      }

      // A network/service failure is reported as a connection problem, never
      // as an expired session.
      setErrorDetail(
        isConnectionFailure(failureStatus)
          ? "MyPetLink is having trouble connecting right now."
          : "We couldn't confirm your session."
      );
      setStatus("error");
    }

    const check = Promise.all([
      getCurrentOwnerSession(),
      getOwnerProfileSettings(),
      enterOwnerPortal(),
    ]);

    if (sessionKey !== null && verifiedSessionKey === sessionKey) {
      // Fast path: render immediately, revalidate in the background. A 401
      // still signs out and redirects; transient failures are left to the
      // page's own data requests to surface. Deferred a microtask so the
      // effect body never sets state synchronously.
      queueMicrotask(() => {
        if (stillCurrent()) {
          setStatus("ready");
        }
      });
      check.catch((caught) => {
        const failureStatus = isApiClientError(caught) ? caught.status : -1;

        if (stillCurrent() && !sessionEnded(caught) && failureStatus === 401) {
          signOutCurrent();
        }
      });

      return () => {
        active = false;
      };
    }

    // The staged loader starts from "waiting": the initial mount state and the
    // Retry handler both reset to it, so nothing needs a synchronous setState
    // here. A pathname change while already "ready" revalidates silently in
    // the background (the stage timers below only advance loading states).
    schedule(LOADER_DELAY_MS, () =>
      setStatus((current) => (current === "waiting" ? "checking" : current))
    );
    schedule(SLOW_HINT_DELAY_MS, () =>
      setStatus((current) => (current === "checking" ? "slow" : current))
    );
    schedule(getSessionCheckTimeoutMs(), () =>
      setStatus((current) =>
        current === "checking" || current === "slow" || current === "waiting"
          ? "timeout"
          : current
      )
    );

    check
      .then(() => {
        if (stillCurrent()) {
          // A check that finishes after the timeout screen appeared still
          // succeeds — better to open the portal than strand the user.
          verifiedSessionKey = sessionKey;
          setStatus("ready");
        }
      })
      .catch(settleFailure)
      .finally(() => {
        clearStageTimers();
        if (active) {
          retryLockRef.current = false;
        }
      });

    return () => {
      active = false;
      clearStageTimers();
    };
  }, [pathname, router, attempt]);

  function handleRetry() {
    if (retryLockRef.current) {
      return;
    }

    retryLockRef.current = true;
    setStatus("waiting");
    setErrorDetail("");
    setAttempt((current) => current + 1);
  }

  if (status === "ready") {
    return children;
  }

  return (
    <SessionCheckingScreen
      detail={status === "error" ? errorDetail : undefined}
      devHint={
        isDevelopment && status === "error"
          ? "Developer hint: Check that the API and local database are running."
          : undefined
      }
      loginHref={ownerLoginPath(getCurrentLocalDestination(pathname))}
      onRetry={handleRetry}
      state={status}
    />
  );
}
