"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { SharedMomentSummary } from "@/components/social/CommunityMomentComposer";
import { Icon } from "@/components/ui/Icon";
import { momentNavigationPath } from "@/lib/momentNavigation";
import { ownerRoutes } from "@/lib/routes";

/** Long enough to read a sentence and reach the link; it can also be closed. */
export const momentSharedNoticeDuration = 8000;

/**
 * The one confirmation after Community's Share a Moment.
 *
 * The composer closes on success, so a message inside it would vanish with it,
 * and the page underneath already updates its own listing
 * (`lib/momentChanges`). This is therefore the only feedback: one short line
 * that says what happened to whom, and the one next step that exists.
 *
 * - Shared publicly by an owner in Community: "View Moment" opens its page.
 * - Anything else has no Community page to open — a Moment kept to "Only me",
 *   or a public one from an owner whose Community Profile is off (it appears on
 *   the pet's Share Profile). Those point to the pet's Moments in My Pets,
 *   where the owner manages it.
 */
export function MomentSharedNotice({
  shared,
  returnTo,
  onDismiss,
}: {
  shared: SharedMomentSummary;
  /** The page the owner is on, so Back on the Moment returns here. */
  returnTo: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, momentSharedNoticeDuration);
    return () => window.clearTimeout(timer);
  }, [onDismiss, shared]);

  const inCommunity = shared.audience === "Public" && shared.communityProfileActive;
  const message =
    shared.audience === "Public"
      ? "Moment shared."
      : "Moment saved. Only you can see it.";
  const action = inCommunity
    ? { href: momentNavigationPath(shared.momentId, returnTo), label: "View Moment" }
    : { href: ownerRoutes.petMoments(shared.petId), label: "View in My Pets" };

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-[var(--owner-mobile-form-action-bottom)] z-[60] flex justify-center lg:inset-x-auto lg:bottom-6 lg:right-6"
      data-testid="moment-shared-notice"
    >
      <div
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] py-2 pl-4 pr-2 text-sm font-bold text-pet-sage shadow-xl shadow-[#0d1b3d]/10"
        role="status"
      >
        <span className="min-w-0 flex-1">{message}</span>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-black text-pet-teal underline-offset-2 transition hover:underline"
          href={action.href}
          onClick={onDismiss}
        >
          {action.label}
        </Link>
        <button
          aria-label="Dismiss"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-pet-muted transition hover:bg-white/70 hover:text-pet-ink"
          onClick={onDismiss}
          type="button"
        >
          <Icon aria-hidden="true" className="h-4 w-4" name="close" />
        </button>
      </div>
    </div>
  );
}
