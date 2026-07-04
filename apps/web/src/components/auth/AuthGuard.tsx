"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getCurrentOwnerSession,
  isOwnerAuthenticated,
  logoutOwner,
} from "@/services/authService";
import { canUseApi } from "@/services/apiConfig";
import { isApiClientError } from "@/services/apiClient";
import { getOwnerProfileSettings } from "@/services/ownerProfileService";

// Development builds only; inlined by Next at build time so it is always false
// in the production bundle. Used to gate a developer-only hint.
const isDevelopment = process.env.NODE_ENV === "development";

type GuardError = "connection" | "session" | null;

// Backend/database unavailable and other transient service failures should read
// as a temporary connection issue, never as "not found".
function isConnectionFailure(status: number) {
  return status === 0 || (status >= 500 && status <= 599);
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [errorKind, setErrorKind] = useState<GuardError>(null);

  useEffect(() => {
    if (!isOwnerAuthenticated()) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    if (canUseApi()) {
      let active = true;

      Promise.resolve()
        .then(() => {
          if (active) {
            setReady(false);
            setErrorKind(null);
          }

          return Promise.all([getCurrentOwnerSession(), getOwnerProfileSettings()]);
        })
        .then(() => {
          if (active) {
            setReady(true);
          }
        })
        .catch((caught) => {
          if (!active) {
            return;
          }

          const status = isApiClientError(caught) ? caught.status : -1;

          if (status === 401) {
            logoutOwner();
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          setErrorKind(isConnectionFailure(status) ? "connection" : "session");
        });

      return () => {
        active = false;
      };
    }

    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  if (errorKind) {
    const isConnection = errorKind === "connection";

    return (
      <div className="grid min-h-screen place-items-center bg-pet-cream px-4">
        <div className="brand-card max-w-md rounded-[2rem] p-6 text-center">
          <p className="text-sm font-bold uppercase text-pet-teal">
            {isConnection ? "Connection issue" : "Something went wrong"}
          </p>
          <h1 className="mt-2 text-2xl font-black text-pet-ink">
            We couldn&rsquo;t load your account
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-pet-muted">
            {isConnection
              ? "MyPetLink is having trouble connecting right now. Please try again in a moment."
              : "We couldn't confirm your session. Please try again."}
          </p>
          {isDevelopment && isConnection ? (
            <p className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-2 text-xs font-semibold leading-5 text-pet-muted">
              Developer hint: Check that the API and local database are running.
            </p>
          ) : null}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#0f5fd0]"
              onClick={() => window.location.reload()}
              type="button"
            >
              Try Again
            </button>
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
              onClick={() => router.replace("/login")}
              type="button"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-pet-cream px-4">
        <div className="brand-card rounded-[2rem] p-6 text-center">
          <p className="text-sm font-semibold text-pet-muted">
            Checking your session...
          </p>
        </div>
      </div>
    );
  }

  return children;
}
