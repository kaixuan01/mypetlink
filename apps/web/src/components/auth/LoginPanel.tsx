"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  loginMockOwner,
  loginWithGoogleIdToken,
} from "@/services/authService";
import { getGoogleClientId, isApiConfigured } from "@/services/apiConfig";
import { isApiClientError } from "@/services/apiClient";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme: "outline" | "filled_blue" | "filled_black";
              size: "large" | "medium" | "small";
              width?: number;
              text?: "signin_with" | "continue_with";
              shape?: "pill" | "rectangular";
            }
          ) => void;
        };
      };
    };
  }
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.04 12.26c0-.82-.07-1.6-.21-2.36H12v4.46h6.19a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.43-4.96 3.43-8.47Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.76v2.98A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6V7.12H1.76a12 12 0 0 0 0 10.76L5.6 14.7Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.68 0 3.2.58 4.39 1.72l3.29-3.29C17.7 1.2 15.1 0 12 0A11.99 11.99 0 0 0 1.76 7.12L5.6 10.1C6.5 7.39 9.02 4.77 12 4.77Z"
      />
    </svg>
  );
}

export function LoginPanel() {
  const router = useRouter();
  const apiMode = isApiConfigured();
  const googleClientId = getGoogleClientId();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [googleReady, setGoogleReady] = useState(!apiMode);

  useEffect(() => {
    if (!apiMode || !googleClientId) {
      return;
    }

    let cancelled = false;
    let renderedWidth = 0;
    let resizeObserver: ResizeObserver | null = null;

    async function handleCredential(idToken: string) {
      setSigningIn(true);
      setError("");

      try {
        await loginWithGoogleIdToken(idToken);
        navigateAfterLogin(router);
      } catch (caught) {
        setError(getLoginErrorMessage(caught));
      } finally {
        setSigningIn(false);
      }
    }

    function renderGoogleButton() {
      if (cancelled || !window.google || !googleButtonRef.current) {
        return;
      }

      const availableWidth = Math.floor(googleButtonRef.current.clientWidth);
      if (availableWidth < 120 || availableWidth === renderedWidth) {
        return;
      }

      renderedWidth = availableWidth;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: Math.min(400, availableWidth),
      });
    }

    function initializeGoogle() {
      if (cancelled || !window.google || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (response.credential) {
            void handleCredential(response.credential);
          } else {
            setError("Google sign-in did not return a valid credential.");
          }
        },
      });
      renderGoogleButton();
      resizeObserver = new ResizeObserver(renderGoogleButton);
      resizeObserver.observe(googleButtonRef.current);
      setGoogleReady(true);
    }

    if (window.google) {
      initializeGoogle();
      return () => {
        cancelled = true;
        resizeObserver?.disconnect();
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    script.onerror = () => {
      if (!cancelled) {
        setError("Google sign-in could not load. Please try again.");
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [apiMode, googleClientId, router]);

  function handleProviderLogin() {
    setError("");
    loginMockOwner();
    navigateAfterLogin(router);
  }

  return (
    <div className="brand-card mx-auto w-full min-w-0 max-w-full rounded-[2rem] p-5 min-[361px]:p-6 sm:p-8">
      <BrandLogo className="h-9 w-auto max-w-full" />
      <h1 className="mt-6 text-2xl font-black text-pet-ink sm:text-3xl">
        Welcome to MyPetLink
      </h1>
      <p className="mt-3 min-w-0 break-words text-sm leading-6 text-pet-muted">
        Sign in to manage your pet profiles, safety contacts, and QR pages.
      </p>

      {error ? (
        <div
          className="mt-5 min-w-0 break-words rounded-2xl border border-[#ffd5cf] bg-[#fff1ee] p-4 text-sm font-bold leading-6 text-[#a63c2e]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid min-w-0 gap-3">
        {apiMode ? (
          googleClientId ? (
            <>
              <div
                className="flex min-h-12 w-full min-w-0 max-w-full justify-center"
                ref={googleButtonRef}
              />
              {!googleReady || signingIn ? (
                <p className="text-center text-xs font-bold text-pet-muted">
                  {signingIn ? "Signing you in..." : "Loading Google sign-in..."}
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
              Google sign-in needs a client ID in local settings before you can
              continue.
            </div>
          )
        ) : (
          <button
            className="inline-flex min-h-12 w-full min-w-0 max-w-full items-center justify-center gap-3 rounded-full border border-pet-border bg-white px-4 py-3 text-sm font-extrabold text-pet-ink shadow-sm transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal min-[361px]:px-5"
            onClick={handleProviderLogin}
            type="button"
          >
            <span className="shrink-0">
              <GoogleMark />
            </span>
            <span className="min-w-0 truncate">Continue with Google</span>
          </button>
        )}
      </div>

      <p className="mt-5 rounded-2xl bg-pet-cream p-4 text-xs leading-5 text-pet-muted">
        No password required. Your pet profiles stay connected to your owner
        account.
      </p>
    </div>
  );
}

function navigateAfterLogin(router: ReturnType<typeof useRouter>) {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect") ?? params.get("next");
  const destination =
    redirect && redirect.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/dashboard";

  router.replace(destination);
}

function getLoginErrorMessage(error: unknown) {
  if (isApiClientError(error)) {
    if (error.status === 0) {
      return "We could not reach MyPetLink right now. Please try again.";
    }

    return error.message;
  }

  return "Google sign-in could not finish. Please try again.";
}
