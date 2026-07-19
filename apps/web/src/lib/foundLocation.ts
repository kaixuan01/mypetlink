import { getWhatsAppLink } from "@/lib/phone";

// Shared "Send Found Location" workflow used by the Safety Profile page and
// the Public Share Profile's Lost Mode card. The finder explicitly taps the
// action first; only then do we ask the browser for location permission. When
// a position is available we open WhatsApp with a map link, and every fallback
// (permission denied, timeout, unsupported browser) still opens WhatsApp so
// the finder can describe the location themselves.
//
// The precise coordinates only ever go into the WhatsApp message for the
// owner — they are never logged or stored.

type SendFoundLocationOptions = {
  whatsappE164: string;
  ownerDisplayName: string;
  petName: string;
  onStatus: (status: string) => void;
  /** Test seam; defaults to a same-tab navigation to the WhatsApp link. */
  openLink?: (href: string) => void;
};

export function sendFoundLocationViaWhatsApp({
  whatsappE164,
  ownerDisplayName,
  petName,
  onStatus,
  openLink = (href) => window.location.assign(href),
}: SendFoundLocationOptions): Promise<void> {
  return new Promise((resolve) => {
    if (!whatsappE164) {
      resolve();
      return;
    }

    const openWhatsappWithMessage = (text: string) => {
      openLink(getWhatsAppLink(whatsappE164, text));
    };

    onStatus("Asking your browser for location permission...");

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onStatus(
        "Location is not available here. A WhatsApp message is ready for you to type the location."
      );
      openWhatsappWithMessage(
        `Hi ${ownerDisplayName}, I found ${petName}. I can describe the found location here.`
      );
      resolve();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        onStatus("Location ready. Opening WhatsApp...");
        openWhatsappWithMessage(
          `Hi ${ownerDisplayName}, I found ${petName}. Found location: ${mapsUrl}`
        );
        resolve();
      },
      () => {
        onStatus(
          "Location was not shared. A WhatsApp message is ready for you to type the location."
        );
        openWhatsappWithMessage(
          `Hi ${ownerDisplayName}, I found ${petName}. I can describe the found location here.`
        );
        resolve();
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );
  });
}
