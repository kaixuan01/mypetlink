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

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

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
            setError("");
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

          if (isApiClientError(caught) && caught.status === 401) {
            logoutOwner();
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          setError(
            isApiClientError(caught) && caught.status === 0
              ? "We could not reach MyPetLink right now. Please check that MyPetLink is running locally, then try again."
              : "We could not confirm your session. Please try again."
          );
        });

      return () => {
        active = false;
      };
    }

    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-pet-cream px-4">
        <div className="brand-card max-w-md rounded-[2rem] p-6 text-center">
          <p className="text-sm font-bold uppercase text-pet-teal">
            Connection needed
          </p>
          <h1 className="mt-2 text-2xl font-black text-pet-ink">
            We could not load your account
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-pet-muted">
            {error}
          </p>
          <button
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
            onClick={() => window.location.reload()}
            type="button"
          >
            Try Again
          </button>
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
