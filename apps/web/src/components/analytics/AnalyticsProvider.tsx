"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  getAnalyticsMeasurementId,
  trackPageView,
} from "@/lib/analytics";

export function AnalyticsProvider() {
  const pathname = usePathname();
  const lastPathnameRef = useRef("");
  const measurementId = getAnalyticsMeasurementId();

  useEffect(() => {
    if (!measurementId || !pathname || lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    trackPageView(pathname);
  }, [measurementId, pathname]);

  if (!measurementId) return null;

  return (
    <Script
      id="mypetlink-ga4"
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  );
}
