// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LostModeContactActions } from "./LostModeContactActions";

afterEach(() => {
  cleanup();
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: undefined,
  });
});

const baseProps = {
  petName: "Doudou",
  ownerDisplayName: "Aina",
  whatsappE164: "+60123456789",
  phoneE164: "+60198765432",
  safetyPagePath: "/q/MPL-SAFE-DOUDOU",
};

describe("LostModeContactActions", () => {
  it("shows WhatsApp, Call, Send Found Location, and View Safety Profile when everything is allowed", () => {
    render(<LostModeContactActions {...baseProps} />);

    const whatsapp = screen.getByRole("link", { name: "WhatsApp Doudou's owner" });
    expect(whatsapp.getAttribute("href")).toContain("https://wa.me/60123456789");
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain(
      "I found Doudou. I would like to share the location with you."
    );

    const call = screen.getByRole("link", { name: "Call Doudou's owner" });
    expect(call.getAttribute("href")).toBe("tel:+60198765432");

    expect(
      screen.getByRole("button", { name: "Send found location to Doudou's owner" })
    ).toBeTruthy();

    const safety = screen.getByRole("link", { name: "View Safety Profile" });
    expect(safety.getAttribute("href")).toBe("/q/MPL-SAFE-DOUDOU");
  });

  it("hides Call when only WhatsApp is allowed", () => {
    render(<LostModeContactActions {...baseProps} phoneE164="" />);

    expect(screen.getByRole("link", { name: "WhatsApp Doudou's owner" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Call Doudou's owner" })).toBeNull();
  });

  it("hides WhatsApp and the found-location action when only the phone is allowed", () => {
    render(<LostModeContactActions {...baseProps} whatsappE164="" />);

    expect(screen.getByRole("link", { name: "Call Doudou's owner" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "WhatsApp Doudou's owner" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Send found location to Doudou's owner" })
    ).toBeNull();
  });

  it("explains the situation instead of rendering broken actions when no contact method is allowed", () => {
    render(
      <LostModeContactActions {...baseProps} whatsappE164="" phoneE164="" />
    );

    expect(screen.queryByRole("link", { name: /owner/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /found location/i })).toBeNull();
    expect(
      screen.getByText(/The owner has not shared direct contact details here/)
    ).toBeTruthy();
    // The Safety Profile stays reachable as the secondary destination.
    expect(screen.getByRole("link", { name: "View Safety Profile" })).toBeTruthy();
  });

  it("requests browser location only after the finder explicitly asks, once at a time", () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<LostModeContactActions {...baseProps} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    const button = screen.getByRole("button", {
      name: "Send found location to Doudou's owner",
    });
    fireEvent.click(button);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    // The permission prompt is still open: further clicks must not stack
    // another request.
    fireEvent.click(button);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain(
      "Asking your browser for location permission"
    );
  });

  it("reports a graceful status when the finder denies location permission", async () => {
    const openSpy = vi.fn();
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error: PositionErrorCallback
        ) => error({} as GeolocationPositionError),
      },
    });
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: openSpy },
    });

    try {
      render(<LostModeContactActions {...baseProps} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Send found location to Doudou's owner" })
      );

      expect(
        await screen.findByText(
          "Location was not shared. A WhatsApp message is ready for you to type the location."
        )
      ).toBeTruthy();
      expect(openSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
