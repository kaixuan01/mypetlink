"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  clearWakeUpState,
  cancelActiveWakeUpRequests,
  getServerServiceWakeUpSnapshot,
  getServiceWakeUpSnapshot,
  subscribeServiceWakeUp,
} from "@/services/serviceWakeUp";

const friendlyMessages = [
  "Fluffing the cushions and fetching your pet profiles.",
  "Just a few more paw steps.",
  "Your pet’s space is nearly ready.",
  "Hang tight — we’re opening the door.",
];

export function ServiceWakeUpState() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const state = useSyncExternalStore(
    subscribeServiceWakeUp,
    getServiceWakeUpSnapshot,
    getServerServiceWakeUpSnapshot
  );

  // Cancel requests owned by the page we are leaving before the next page's
  // passive effects register their requests. A passive effect here races with
  // the destination page and can abort its brand-new first request.
  useLayoutEffect(() => {
    if (previousPathname.current !== pathname) {
      cancelActiveWakeUpRequests();
      previousPathname.current = pathname;
    }
  }, [pathname]);

  if (state.status === "idle") return null;

  const isAdmin = pathname.startsWith("/admin");
  const failed = state.status === "failed";
  const title = failed
    ? isAdmin
      ? "MyPetLink needs a little more time"
      : "MyPetLink needs a little more time 🐾"
    : isAdmin
      ? "Preparing MyPetLink…"
      : state.attempt > 1
        ? "Almost ready…"
        : "Waking up MyPetLink 🐾";
  const message = failed
    ? isAdmin
      ? "Please try again in a moment. Your work is safe."
      : "Please try again in a moment. Your pet information is safe."
    : isAdmin
      ? "Please wait while the service becomes ready."
      : state.attempt > 1
        ? friendlyMessages[(state.attempt - 2) % friendlyMessages.length]
        : "We’re getting your pet’s space ready. This may take a little moment.";

  return (
    <div
      aria-live="polite"
      className="fixed inset-0 z-[100] grid place-items-center bg-pet-cream/94 px-4 py-8 backdrop-blur-sm"
      role="status"
    >
      <section className="brand-card w-full max-w-sm rounded-[2rem] px-6 py-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] bg-pet-apricot text-pet-coral">
          <Icon className="h-8 w-8" name="paw" />
        </span>
        <h1 className="mt-5 text-2xl font-black text-pet-ink">{title}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-pet-muted">
          {message}
        </p>

        {!failed ? (
          <span aria-hidden="true" className="mt-6 flex justify-center gap-2">
            <span className="wake-paw h-2.5 w-2.5 rounded-full bg-pet-coral" />
            <span className="wake-paw h-2.5 w-2.5 rounded-full bg-pet-teal [animation-delay:180ms]" />
            <span className="wake-paw h-2.5 w-2.5 rounded-full bg-pet-sky [animation-delay:360ms]" />
          </span>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#0f5fd0]"
              onClick={() => {
                clearWakeUpState();
                window.location.reload();
              }}
              type="button"
            >
              Try Again
            </button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
              href="/"
            >
              Back to Home
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
