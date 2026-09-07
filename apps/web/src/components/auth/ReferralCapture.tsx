"use client";

import { useEffect } from "react";
import { captureReferralFromUrl } from "@/lib/referralAttribution";
import { isOwnerAuthenticated } from "@/services/authService";

export function ReferralCapture() {
  useEffect(() => {
    const cleanedUrl = captureReferralFromUrl(
      window.location.href,
      window.localStorage,
      new Date(),
      isOwnerAuthenticated()
    );
    if (cleanedUrl) {
      window.history.replaceState(window.history.state, "", cleanedUrl);
    }
  }, []);

  return null;
}
