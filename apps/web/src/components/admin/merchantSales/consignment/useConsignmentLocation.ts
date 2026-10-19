"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isConsignmentView, type ConsignmentView } from "./model";

// The Consignment section keeps its view and the open record in the URL, like
// the rest of Merchant Sales, so refresh and Back both restore where you were.

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export type ConsignmentLocation = {
  view: ConsignmentView;
  agreementId: string | null;
  dispatchId: string | null;
  reportId: string | null;
  stocktakeId: string | null;
  navigate: (patch: { view?: ConsignmentView; agreement?: string | null; dispatch?: string | null; report?: string | null; stocktake?: string | null }) => void;
};

export function useConsignmentLocation(): ConsignmentLocation {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const dispatchId = params.get("dispatch");
  const agreementId = params.get("agreement");
  const reportId = params.get("report");
  const stocktakeId = params.get("stocktake");
  const requested = params.get("view");
  // An open record decides its own view, so an old dispatch link still lands on it.
  const view: ConsignmentView = dispatchId
    ? "custody"
    : agreementId
      ? "agreements"
      : reportId
        ? "sales"
        : stocktakeId
          ? "reconciliation"
          : isConsignmentView(requested)
        ? requested
        : "overview";

  const navigate = useCallback<ConsignmentLocation["navigate"]>((patch) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "consignment");
    if (patch.view) url.searchParams.set("view", patch.view);
    const keys = ["agreement", "dispatch", "report", "stocktake"] as const;
    // Opening one record, or switching section, closes any other open record.
    const opensRecord = keys.some((key) => typeof patch[key] === "string");
    for (const key of keys) {
      const value = patch[key];
      if (typeof value === "string") url.searchParams.set(key, value);
      else if (value === null || patch.view || opensRecord) url.searchParams.delete(key);
    }
    if (url.search === window.location.search) return;
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    // Next's router listens for popstate, not pushState, so nudge it.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  return { view, agreementId, dispatchId, reportId, stocktakeId, navigate };
}
