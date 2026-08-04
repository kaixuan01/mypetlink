"use client";

import { useState } from "react";
import { copyTextToClipboard } from "@/components/portal/PublicLinkActions";
import { Icon } from "@/components/ui/Icon";
import type { OrderShipmentView } from "@/lib/orders";

/**
 * Owner-facing tracking block, shared by the Orders list and the order detail
 * page so the two can never disagree about what a shipped order shows.
 *
 * The tracking number and the tracking link are independent. A courier without
 * a configured tracking template still gives the customer a usable number, so
 * the number is always shown once the parcel has shipped and only the link is
 * conditional. A missing link is explained rather than rendered as a dead
 * button.
 */
export function OrderTrackingPanel({
  shipment,
  compact = false,
}: {
  shipment: OrderShipmentView;
  compact?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  if (!shipment.visible || !shipment.trackingNumber) {
    return null;
  }

  const trackingNumber = shipment.trackingNumber;

  async function handleCopy() {
    const copied = await copyTextToClipboard(trackingNumber);
    setCopyStatus(
      copied
        ? "Tracking number copied."
        : "Copy unavailable. Select and copy the tracking number."
    );
    window.setTimeout(() => setCopyStatus(""), 2500);
  }

  return (
    <div
      className={`min-w-0 rounded-[1.1rem] border border-pet-border bg-white px-4 py-3 ${
        compact ? "mt-3" : "mt-4"
      }`}
      data-testid="order-tracking-panel"
    >
      <p className="text-[0.68rem] font-extrabold uppercase text-pet-muted">
        Tracking number
      </p>
      {/* Selectable and fully wrapping: a long number must stay copyable by
          hand and must never widen the card. */}
      <p className="mt-1 select-all break-all text-sm font-bold text-pet-ink">
        {trackingNumber}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
          onClick={() => void handleCopy()}
          type="button"
        >
          <Icon name="record" className="h-4 w-4" />
          Copy tracking number
        </button>
        {shipment.trackingUrl ? (
          <a
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pet-teal px-4 py-2 text-sm font-extrabold text-white transition hover:opacity-90"
            href={shipment.trackingUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Track Parcel
          </a>
        ) : null}
      </div>

      {shipment.trackingUrl ? null : (
        <p className="mt-2 text-xs font-semibold leading-5 text-pet-muted">
          Tracking link is not available. Use this number on the courier&rsquo;s
          website.
        </p>
      )}

      {copyStatus ? (
        <p className="mt-2 text-xs font-bold text-pet-sage" role="status">
          {copyStatus}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Neutral note for a shipped order whose tracking number has not been recorded
 * yet. Kept separate so an absent number is never mistaken for a hidden one.
 */
export function MissingTrackingNumberNote({
  shipment,
}: {
  shipment: OrderShipmentView;
}) {
  if (!shipment.visible || shipment.trackingNumber) {
    return null;
  }

  return (
    <p className="mt-3 rounded-[1.1rem] bg-pet-cream px-4 py-3 text-sm font-semibold leading-5 text-pet-muted">
      Tracking number has not been added yet.
    </p>
  );
}
