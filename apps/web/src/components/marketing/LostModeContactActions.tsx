"use client";

import { useState } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { sendFoundLocationViaWhatsApp } from "@/lib/foundLocation";
import { getCallLink, getWhatsAppLink } from "@/lib/phone";

type LostModeContactActionsProps = {
  petName: string;
  ownerDisplayName: string;
  /** Owner-approved WhatsApp number in E.164 form, or "" when not allowed. */
  whatsappE164: string;
  /** Owner-approved phone number in E.164 form, or "" when not allowed. */
  phoneE164: string;
  /** Safety Page path, or "" when the pet has no active Safety Page. */
  safetyPagePath: string;
};

// Immediate finder actions for the Lost Mode card on the Public Share
// Profile. A finder should be able to reach the owner right here without
// first opening another page; the Safety Page stays available as the fuller
// secondary destination. Only owner-approved contact methods are offered —
// callers pass "" for anything the owner has not allowed.
export function LostModeContactActions({
  petName,
  ownerDisplayName,
  whatsappE164,
  phoneE164,
  safetyPagePath,
}: LostModeContactActionsProps) {
  const [locationStatus, setLocationStatus] = useState("");
  const [sendingLocation, setSendingLocation] = useState(false);

  const canWhatsapp = Boolean(whatsappE164);
  const canCall = Boolean(phoneE164);
  const whatsappHref = canWhatsapp
    ? getWhatsAppLink(
        whatsappE164,
        `I found ${petName}. I would like to share the location with you.`
      )
    : "";
  const callHref = canCall ? getCallLink(phoneE164) : "";

  async function handleSendFoundLocation() {
    if (!canWhatsapp || sendingLocation) {
      return;
    }

    setSendingLocation(true);

    try {
      await sendFoundLocationViaWhatsApp({
        whatsappE164,
        ownerDisplayName,
        petName,
        onStatus: setLocationStatus,
      });
    } finally {
      setSendingLocation(false);
    }
  }

  return (
    <div className="grid gap-3">
      {canWhatsapp || canCall ? (
        <div className={`grid gap-3 ${canWhatsapp && canCall ? "grid-cols-2" : ""}`}>
          {canWhatsapp ? (
            <CTAButton
              ariaLabel={`WhatsApp ${petName}'s owner`}
              href={whatsappHref}
              icon="phone"
              target="_blank"
              rel="noopener noreferrer"
              variant="coral"
              fullWidth
              className="min-h-12"
            >
              {canCall ? "WhatsApp" : "WhatsApp Owner"}
            </CTAButton>
          ) : null}
          {canCall ? (
            <CTAButton
              ariaLabel={`Call ${petName}'s owner`}
              href={callHref}
              icon="phone"
              variant="coral"
              fullWidth
              className="min-h-12"
            >
              {canWhatsapp ? "Call" : "Call Owner"}
            </CTAButton>
          ) : null}
        </div>
      ) : (
        <p className="rounded-[1rem] bg-white p-4 text-sm font-semibold leading-6 text-pet-muted">
          The owner has not shared direct contact details here.
          {safetyPagePath
            ? " Please check the Safety Page below for more ways to help."
            : ` If ${petName} is wearing a tag, please follow the instructions on it.`}
        </p>
      )}

      {canWhatsapp ? (
        <>
          <CTAButton
            ariaLabel={`Send found location to ${petName}'s owner`}
            disabled={sendingLocation}
            icon="pin"
            onClick={handleSendFoundLocation}
            variant="dark"
            fullWidth
            className="min-h-12"
          >
            {sendingLocation ? "Getting Location..." : "Send Found Location"}
          </CTAButton>
          <p className="text-xs font-semibold leading-5 text-pet-muted">
            Your browser will ask permission to share your location, then a
            WhatsApp message with the map link opens for you to send.
          </p>
        </>
      ) : null}

      {locationStatus ? (
        <p
          className="rounded-[1rem] bg-white p-4 text-center text-sm font-bold leading-6 text-pet-ink"
          role="status"
        >
          {locationStatus}
        </p>
      ) : null}

      {safetyPagePath ? (
        <CTAButton
          href={safetyPagePath}
          icon="qr"
          target="_blank"
          rel="noopener noreferrer"
          variant="outline"
          fullWidth
          className="min-h-12 bg-white"
        >
          View Safety Page
        </CTAButton>
      ) : null}
    </div>
  );
}
