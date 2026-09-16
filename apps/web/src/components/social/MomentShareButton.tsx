"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  getNativeShareAvailability,
  getServerNativeShareAvailability,
  requestNativeShare,
  subscribeToNativeShareAvailability,
} from "@/lib/nativeShare";
import { momentPath } from "@/lib/routes";
import { getServerFallbackBaseUrl } from "@/lib/siteUrl";

type MomentShareButtonProps = {
  momentId: string;
  title: string;
  className?: string;
};

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal";

/**
 * Shares one Moment.
 *
 * Reaches the device share sheet through the same `nativeShare` helper every
 * other share in MyPetLink uses, so availability, cancellation and the outcome
 * vocabulary are decided in one place rather than re-derived here. The Share
 * Center itself is not reused: it is the share *experience for a pet* — QR
 * codes, a printable card, the Safety Profile — and none of that belongs on a
 * Moment.
 *
 * What it shares is the canonical Moment URL, which is the same address the
 * card linked to and the same one a like notification opens.
 */
export function MomentShareButton({
  momentId,
  title,
  className = "",
}: MomentShareButtonProps) {
  const [status, setStatus] = useState("");
  const shareAvailable = useSyncExternalStore(
    subscribeToNativeShareAvailability,
    getNativeShareAvailability,
    getServerNativeShareAvailability
  );

  useEffect(() => {
    if (!status) return;

    const timer = window.setTimeout(() => setStatus(""), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  function momentUrl() {
    const path = momentPath(momentId);
    const origin =
      typeof window === "undefined"
        ? getServerFallbackBaseUrl()
        : window.location.origin;

    return `${origin}${path}`;
  }

  async function share() {
    const url = momentUrl();

    if (shareAvailable) {
      const outcome = await requestNativeShare({ title, url });

      // Backing out of the share sheet is not a failure and says nothing.
      if (outcome === "completed" || outcome === "cancelled") {
        return;
      }
    }

    setStatus((await copyToClipboard(url)) ? "Link copied." : url);
  }

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <button className={buttonClass} onClick={share} type="button">
        <Icon aria-hidden="true" className="h-4 w-4" name="qr" />
        Share
      </button>

      {status ? (
        <p
          aria-live="polite"
          className="text-xs font-bold text-pet-sage [overflow-wrap:anywhere]"
          role="status"
        >
          {status === "Link copied." ? status : `Copy this link: ${status}`}
        </p>
      ) : null}
    </div>
  );
}

async function copyToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
