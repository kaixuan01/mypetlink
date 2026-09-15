"use client";

import { useEffect, useState } from "react";
import { readStoredAuthSession } from "@/services/authStorage";

/**
 * Whether this browser currently holds an owner session.
 *
 * Null until the check has run. Public social pages are prerendered by the
 * static export and served to signed-out visitors and signed-in owners alike,
 * so the answer cannot be known during the first render — a control that
 * depends on it should stay inert rather than guess and then flip.
 *
 * This is a rendering convenience only. It is never authorization: the API
 * decides every social action on its own.
 */
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const read = () =>
      setSignedIn(Boolean(readStoredAuthSession()?.accessToken));

    read();

    // Signing out in another tab should not leave this page offering actions
    // that will now be refused.
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  return signedIn;
}
