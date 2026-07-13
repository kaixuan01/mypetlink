import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

export type SessionCheckState =
  | "waiting"
  | "checking"
  | "slow"
  | "offline"
  | "timeout"
  | "error";

type SessionCheckingScreenProps = {
  state: SessionCheckState;
  /** Login URL that preserves the requested destination per existing rules. */
  loginHref: string;
  onRetry?: () => void;
  /** Disables Retry while a re-check is in flight. */
  retrying?: boolean;
  /** Extra context shown under the primary error copy (already user-friendly). */
  detail?: string;
  /** Development-only troubleshooting hint; never render in production. */
  devHint?: string;
};

const copy: Record<
  Exclude<SessionCheckState, "waiting">,
  { primary: string; secondary: string }
> = {
  checking: {
    primary: "Getting your account ready...",
    secondary: "Preparing your pet dashboard securely.",
  },
  slow: {
    primary: "Getting your account ready...",
    secondary: "This is taking a little longer than usual.",
  },
  offline: {
    primary: "You appear to be offline.",
    secondary: "Check your connection and try again.",
  },
  timeout: {
    primary: "We could not finish checking your session.",
    secondary: "Please try again, or go back to sign in.",
  },
  error: {
    primary: "We could not finish checking your session.",
    secondary: "Please try again in a moment.",
  },
};

// Branded full-screen state shown while a protected Owner Portal route
// confirms the signed-in session. Compact centered composition (no oversized
// pill), warm copy, subtle paw-step progress animation, and recoverable
// offline/timeout/error states so nobody is stuck on an infinite loader.
export function SessionCheckingScreen({
  state,
  loginHref,
  onRetry,
  retrying = false,
  detail,
  devHint,
}: SessionCheckingScreenProps) {
  const isLoadingState =
    state === "waiting" || state === "checking" || state === "slow";
  const showActions = !isLoadingState;
  const text = state === "waiting" ? null : copy[state];

  return (
    <div className="session-screen relative grid min-h-screen place-items-center overflow-hidden bg-pet-cream px-4 py-8 supports-[min-height:100dvh]:min-h-dvh">
      {/* Soft brand accents behind the loader. Decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-pet-apricot opacity-50 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#e8f3ff] opacity-60 blur-3xl" />
      </div>

      {state === "waiting" ? null : (
        <div className="session-fade-in relative w-[min(24rem,90vw)] text-center">
          <BrandLogo
            className="mx-auto h-14 w-14"
            markOnly
            priority
          />
          <p className="mt-2 text-base font-black text-pet-ink">MyPetLink</p>

          {isLoadingState ? (
            <span aria-hidden="true" className="mt-6 flex justify-center gap-2">
              <span className="paw-step h-2.5 w-2.5 rounded-full bg-pet-coral" />
              <span className="paw-step h-2.5 w-2.5 rounded-full bg-pet-teal [animation-delay:180ms]" />
              <span className="paw-step h-2.5 w-2.5 rounded-full bg-pet-sky [animation-delay:360ms]" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="mx-auto mt-6 grid h-12 w-12 place-items-center rounded-2xl bg-white text-pet-coral shadow-sm"
            >
              <PawMark />
            </span>
          )}

          <div aria-live="polite" className="mt-5" role="status">
            <p className="text-lg font-black leading-7 text-pet-ink">
              {text?.primary}
            </p>
            <p className="mt-1.5 text-sm font-semibold leading-6 text-pet-muted">
              {text?.secondary}
            </p>
            {detail && showActions ? (
              <p className="mt-2 text-sm font-semibold leading-6 text-pet-muted">
                {detail}
              </p>
            ) : null}
          </div>

          {devHint && showActions ? (
            <p className="mt-3 rounded-[1rem] bg-white/70 px-4 py-2 text-xs font-semibold leading-5 text-pet-muted">
              {devHint}
            </p>
          ) : null}

          {showActions ? (
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-6 py-3 text-sm font-extrabold text-white transition hover:bg-[#0f5fd0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal disabled:cursor-wait disabled:opacity-60"
                disabled={retrying}
                onClick={onRetry}
                type="button"
              >
                {retrying ? "Retrying..." : "Retry"}
              </button>
              {state !== "offline" ? (
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-6 py-3 text-sm font-extrabold text-pet-ink no-underline transition hover:bg-pet-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
                  href={loginHref}
                >
                  Back to sign in
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Small inline paw so the recoverable states keep a friendly brand mark
// without pulling in another asset.
function PawMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <circle cx="7.5" cy="8" r="2.2" />
      <circle cx="16.5" cy="8" r="2.2" />
      <circle cx="11" cy="5.4" r="2" />
      <circle cx="13" cy="5.4" r="2" />
      <path d="M7.6 17.7c.3-3 2.2-5.1 4.4-5.1s4.1 2.1 4.4 5.1c.2 2-1.5 3.1-3.1 2.3l-.7-.3a1.6 1.6 0 0 0-1.2 0l-.7.3c-1.6.8-3.3-.3-3.1-2.3Z" />
    </svg>
  );
}
