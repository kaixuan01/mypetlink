// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFoundLocationViaWhatsApp } from "./foundLocation";

type GeolocationSuccess = (position: {
  coords: { latitude: number; longitude: number };
}) => void;
type GeolocationError = () => void;

function mockGeolocation(
  implementation:
    | ((success: GeolocationSuccess, error: GeolocationError) => void)
    | null
) {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: implementation
      ? { getCurrentPosition: implementation }
      : undefined,
  });
}

afterEach(() => {
  mockGeolocation(null);
});

describe("sendFoundLocationViaWhatsApp", () => {
  it("does nothing without an allowed WhatsApp number", async () => {
    const onStatus = vi.fn();
    const openLink = vi.fn();

    await sendFoundLocationViaWhatsApp({
      whatsappE164: "",
      ownerDisplayName: "Aina",
      petName: "Doudou",
      onStatus,
      openLink,
    });

    expect(onStatus).not.toHaveBeenCalled();
    expect(openLink).not.toHaveBeenCalled();
  });

  it("opens WhatsApp with a map link when the finder grants location", async () => {
    mockGeolocation((success) =>
      success({ coords: { latitude: 3.139, longitude: 101.6869 } })
    );
    const onStatus = vi.fn();
    const openLink = vi.fn();

    await sendFoundLocationViaWhatsApp({
      whatsappE164: "+60123456789",
      ownerDisplayName: "Aina",
      petName: "Doudou",
      onStatus,
      openLink,
    });

    expect(onStatus).toHaveBeenCalledWith(
      "Asking your browser for location permission..."
    );
    expect(onStatus).toHaveBeenCalledWith("Location ready. Opening WhatsApp...");
    expect(openLink).toHaveBeenCalledTimes(1);
    const href = openLink.mock.calls[0][0] as string;
    expect(href).toContain("https://wa.me/60123456789");
    expect(decodeURIComponent(href)).toContain(
      "https://www.google.com/maps?q=3.139,101.6869"
    );
    expect(decodeURIComponent(href)).toContain("I found Doudou");
  });

  it("still opens WhatsApp when location permission is denied or times out", async () => {
    mockGeolocation((_success, error) => error());
    const onStatus = vi.fn();
    const openLink = vi.fn();

    await sendFoundLocationViaWhatsApp({
      whatsappE164: "+60123456789",
      ownerDisplayName: "Aina",
      petName: "Doudou",
      onStatus,
      openLink,
    });

    expect(onStatus).toHaveBeenCalledWith(
      "Location was not shared. A WhatsApp message is ready for you to type the location."
    );
    const href = decodeURIComponent(openLink.mock.calls[0][0] as string);
    expect(href).toContain("I can describe the found location here");
    expect(href).not.toContain("maps?q=");
  });

  it("falls back gracefully when the browser has no geolocation support", async () => {
    mockGeolocation(null);
    const onStatus = vi.fn();
    const openLink = vi.fn();

    await sendFoundLocationViaWhatsApp({
      whatsappE164: "+60123456789",
      ownerDisplayName: "Aina",
      petName: "Doudou",
      onStatus,
      openLink,
    });

    expect(onStatus).toHaveBeenCalledWith(
      "Location is not available here. A WhatsApp message is ready for you to type the location."
    );
    expect(openLink).toHaveBeenCalledTimes(1);
  });
});
