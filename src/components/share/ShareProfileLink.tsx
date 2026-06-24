"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";

type ShareProfileLinkProps = {
  path: string;
  petName?: string;
  className?: string;
  showShareButton?: boolean;
};

export function ShareProfileLink({
  path,
  petName = "this pet",
  className = "",
  showShareButton = false,
}: ShareProfileLinkProps) {
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getDefaultOrigin
  );
  const [status, setStatus] = useState("");

  const fullUrl = useMemo(() => {
    if (path.startsWith("http")) {
      return path;
    }

    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  }, [origin, path]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setStatus("Profile link copied.");
      return true;
    } catch {
      setStatus("Copy is not available here. Select the link and copy it manually.");
      return false;
    }
  }

  async function shareProfile() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${petName}'s MyPetLink Profile`,
          text: `Meet ${petName} on MyPetLink.`,
          url: fullUrl,
        });
        setStatus("Profile link shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await copyLink();
  }

  return (
    <section
      className={[
        "rounded-[1.5rem] border border-pet-border bg-white/90 p-4 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label className="grid gap-2">
        <span className="text-xs font-bold uppercase text-pet-muted">
          Share profile link
        </span>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="brand-input min-w-0 flex-1 bg-white"
            readOnly
            type="text"
            value={fullUrl}
          />
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0]"
            onClick={copyLink}
            type="button"
          >
            <Icon name="qr" className="h-4 w-4" />
            Copy Link
          </button>
          {showShareButton ? (
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155]"
              onClick={shareProfile}
              type="button"
            >
              <Icon name="heart" className="h-4 w-4" />
              Share Profile
            </button>
          ) : null}
        </div>
      </label>
      {status ? (
        <p className="mt-3 text-sm font-bold text-pet-sage">{status}</p>
      ) : null}
    </section>
  );
}

function subscribeToOrigin() {
  return () => {};
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getDefaultOrigin() {
  return "https://mypetlink.com.my";
}
