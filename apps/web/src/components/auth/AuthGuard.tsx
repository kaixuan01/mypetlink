"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  SessionCheckingScreen,
  type SessionCheckState,
} from "@/components/auth/SessionCheckingScreen";
import {
  getCurrentOwnerSession,
  isOwnerAuthenticated,
  logoutOwner,
} from "@/services/authService";
import { canUseApi, getFrontendResilienceConfig } from "@/services/apiConfig";
import { isApiClientError } from "@/services/apiClient";
import { getOwnerProfileSettings } from "@/services/ownerProfileService";
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

// The session request itself can legitimately take up to the database wake-up
// retry window (serverless SQL warming up), so the guard timeout must sit
// safely beyond it — never racing a legitimate token refresh or wake retry.
export function getSessionCheckTimeoutMs() {
  return getFrontendResilienceConfig().maximumWaitMs + 15_000;
}

// Once a session has been verified against the API in this app load, remounting
// the guard (every in-portal navigation remounts the page tree) renders the
// destination immediately and revalidates in the background instead of blocking
// the whole portal behind a repeat check. Cleared on logout/expiry via the 401
// path below; a full reload (new module instance) always re-verifies first.
let ownerSessionVerifiedThisLoad = false;

export function resetOwnerSessionVerificationForTests() {
  ownerSessionVerifiedThisLoad = false;
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

    function schedule(delayMs: number, run: () => void) {
      timers.push(
        window.setTimeout(() => {
          if (active) {
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

    function settleFailure(caught: unknown) {
      if (!active) {
        return;
      }

      const failureStatus = isApiClientError(caught) ? caught.status : -1;

      if (failureStatus === 401) {
        ownerSessionVerifiedThisLoad = false;
        logoutOwner();
        router.replace(ownerLoginPath(returnTo));
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
    ]);

    if (ownerSessionVerifiedThisLoad) {
      // Fast path: render immediately, revalidate in the background. A 401
      // still signs out and redirects; transient failures are left to the
      // page's own data requests to surface. Deferred a microtask so the
      // effect body never sets state synchronously.
      queueMicrotask(() => {
        if (active) {
          setStatus("ready");
        }
      });
      check.catch((caught) => {
        const failureStatus = isApiClientError(caught) ? caught.status : -1;

        if (active && failureStatus === 401) {
          ownerSessionVerifiedThisLoad = false;
          logoutOwner();
          router.replace(ownerLoginPath(returnTo));
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
        if (active) {
          // A check that finishes after the timeout screen appeared still
          // succeeds — better to open the portal than strand the user.
          ownerSessionVerifiedThisLoad = true;
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
