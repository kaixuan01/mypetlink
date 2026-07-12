"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canUseApi } from "@/services/apiConfig";
import {
  checkAdminAccess,
  clearCachedAdminAccess,
  getCachedAdminAccess,
  isAdminAuthenticated,
} from "@/services/authService";
import { classifyAdminAccessError } from "@/lib/adminGuardState";

// Development builds only; inlined by Next at build time.
const isDevelopment = process.env.NODE_ENV === "development";

type GuardState =
  | "initializing"
  | "ready"
  | "denied"
  | "temporarilyUnavailable"
  | "error";

// Derives the starting state from the in-memory verified-access cache so moving
// between Admin menu items (which remounts this boundary) renders instantly with
// no re-check and no flash — instead of re-verifying and briefly showing an error
// during every normal page transition.
function initialGuardState(): GuardState {
  if (typeof window === "undefined" || !canUseApi()) {
    return "ready";
  }

  const cached = getCachedAdminAccess();

  if (cached) {
    return cached.access?.admin.isActive ? "ready" : "denied";
  }

  return "initializing";
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GuardState>(initialGuardState);
  const [retryToken, setRetryToken] = useState(0);

  function handleRetry() {
    setState("initializing");
    setRetryToken((token) => token + 1);
  }

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      clearCachedAdminAccess();
      router.replace(`/admin/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    // In mock/local mode there is no API to verify against; the initial state is
    // already "ready".
    if (!canUseApi()) {
      return;
    }

    // Reuse the already-verified result across navigations. When it exists the
    // initial state already reflects it, so there is nothing to re-check here —
    // this is what stops every menu click from re-verifying (and re-erroring).
    const cached = getCachedAdminAccess();

    if (cached && retryToken === 0) {
      return;
    }

    let active = true;

    checkAdminAccess()
      .then((access) => {
        if (active) {
          setState(access?.admin.isActive ? "ready" : "denied");
        }
      })
      .catch((caught) => {
        if (!active) {
          return;
        }

        switch (classifyAdminAccessError(caught)) {
          case "cancelled":
            // Navigation/unmount cancelled the request — not an error.
            return;
          case "sessionExpired":
            clearCachedAdminAccess();
            router.replace(
              `/admin/login?redirect=${encodeURIComponent(pathname)}`
            );
            return;
          case "denied":
            setState("denied");
            return;
          case "temporarilyUnavailable":
            setState("temporarilyUnavailable");
            return;
          default:
            setState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [pathname, router, retryToken]);

  if (state === "denied") {
    return (
      <GuardShell>
        <p className="text-sm font-bold uppercase text-slate-400">Admin access</p>
        <h1 className="mt-2 text-xl font-black text-slate-950">
          Access not available
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This account does not have permission to use the Admin Portal.
        </p>
      </GuardShell>
    );
  }

  if (state === "temporarilyUnavailable") {
    return (
      <GuardShell>
        <p className="text-sm font-bold uppercase text-slate-400">Almost ready</p>
        <h1 className="mt-2 text-xl font-black text-slate-950">
          MyPetLink needs a little more time
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Please try again in a moment.
        </p>
        <TryAgainButton onRetry={handleRetry} />
      </GuardShell>
    );
  }

  if (state === "error") {
    return (
      <GuardShell>
        <p className="text-sm font-bold uppercase text-slate-400">
          Something went wrong
        </p>
        <h1 className="mt-2 text-xl font-black text-slate-950">
          We couldn&rsquo;t open this page
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Please try again. If it keeps happening, contact the MyPetLink team.
        </p>
        {isDevelopment ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold leading-5 text-slate-500">
            Developer hint: Check that the API and local database are running.
          </p>
        ) : null}
        <TryAgainButton onRetry={handleRetry} />
      </GuardShell>
    );
  }

  if (state === "initializing") {
    return (
      <GuardShell>
        <p className="text-sm font-bold uppercase text-slate-400">Admin</p>
        <h1 className="mt-2 text-xl font-black text-slate-950">
          Preparing your admin workspace&hellip;
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Getting everything ready for you.
        </p>
      </GuardShell>
    );
  }

  return children;
}

function TryAgainButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-slate-950 bg-slate-950 px-5 text-sm font-extrabold text-white"
      onClick={onRetry}
      type="button"
    >
      Try Again
    </button>
  );
}

function GuardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f8f9] px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}
