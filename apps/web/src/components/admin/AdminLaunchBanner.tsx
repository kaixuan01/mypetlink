"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";

export const ADMIN_LAUNCH_BANNER_STORAGE_KEY = "mypetlink_admin_early_launch_banner_v1";
const BANNER_CHANGE_EVENT = "mypetlink-admin-launch-banner-change";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(BANNER_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(BANNER_CHANGE_EVENT, onStoreChange);
  };
}

function isVisible() {
  try {
    return window.localStorage.getItem(ADMIN_LAUNCH_BANNER_STORAGE_KEY) !== "dismissed";
  } catch {
    return true;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(ADMIN_LAUNCH_BANNER_STORAGE_KEY, "dismissed");
  } catch {
    // Storage may be unavailable in a locked-down browser. The notice can
    // still be dismissed for the current render.
  }
  window.dispatchEvent(new Event(BANNER_CHANGE_EVENT));
}

export function AdminLaunchBanner() {
  const storedVisibility = useSyncExternalStore(subscribe, isVisible, () => true);
  const [dismissedForCurrentPage, setDismissedForCurrentPage] = useState(false);
  const visible = storedVisibility && !dismissedForCurrentPage;

  if (!visible) return null;

  return (
    <aside
      className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 sm:mb-5 sm:px-4"
      data-testid="admin-launch-banner"
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" name="shield" />
      <p className="min-w-0 flex-1 text-xs font-semibold leading-5 sm:text-sm">
        <span className="font-black">Early launch mode</span>
        {" — payments are reviewed manually. Changes here affect live owner, order, and tag status."}
      </p>
      <button
        aria-label="Dismiss early launch notice"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-amber-900 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        onClick={() => {
          setDismissedForCurrentPage(true);
          dismiss();
        }}
        type="button"
      >
        <Icon aria-hidden="true" className="h-4 w-4" name="close" />
      </button>
    </aside>
  );
}
