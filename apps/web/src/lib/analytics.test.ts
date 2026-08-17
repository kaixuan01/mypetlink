// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnalyticsEvent,
  sanitizeAnalyticsPath,
  trackEvent,
  trackPageView,
} from "./analytics";

function analyticsCalls() {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as unknown[]));
}

describe("product analytics privacy boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST12345");
    delete window.dataLayer;
    delete window.gtag;
    delete window.__myPetLinkGaMeasurementId;
    window.history.replaceState({}, "", "/pets/private-pet-id/edit?tab=contact");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["/p/milo-secret-code?share=private", "/p/[profile]"],
    ["/q/private-safety-code", "/q/[safety-profile]"],
    ["/t/private-tag-code", "/t/[tag]"],
    ["/n/private-tag-code", "/n/[tag]"],
    ["/pets/private-pet-id/moments", "/pets/[pet]/moments"],
    ["/orders/view?order=MPL-ORD-PRIVATE", "/orders/view"],
    ["/pets/new?from=private", "/pets/new"],
  ])("sanitizes %s", (input, expected) => {
    expect(sanitizeAnalyticsPath(input)).toBe(expected);
  });

  it("emits the canonical event name and drops non-allowlisted or invalid metadata", () => {
    trackEvent(AnalyticsEvent.PetCreated, {
      source: "owner_portal",
      pet_name: "Milo",
      email: "owner@example.com",
    } as never);

    const event = analyticsCalls().find(
      (call) => call[0] === "event" && call[1] === "pet_created"
    );
    expect(event?.[2]).toEqual({
      source: "owner_portal",
      page_path: "/pets/[pet]/edit",
      page_location: "http://localhost:3000/pets/[pet]/edit",
      page_title: "/pets/[pet]/edit",
    });
    expect(JSON.stringify(event)).not.toContain("Milo");
    expect(JSON.stringify(event)).not.toContain("owner@example.com");
    expect(JSON.stringify(event)).not.toContain("private-pet-id");
  });

  it("reports a sanitized manual page view and disables GA automatic page views", () => {
    trackPageView("/p/private-profile?share=private-token");
    const calls = analyticsCalls();
    expect(calls).toContainEqual([
      "config",
      "G-TEST12345",
      expect.objectContaining({
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        anonymize_ip: true,
      }),
    ]);
    expect(calls).toContainEqual([
      "event",
      "page_view",
      {
        page_path: "/p/[profile]",
        page_location: "http://localhost:3000/p/[profile]",
        page_title: "/p/[profile]",
      },
    ]);
    expect(JSON.stringify(calls)).not.toContain("private-token");
  });

  it("is inert when the measurement id is absent or malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "not-a-measurement-id");
    trackEvent(AnalyticsEvent.MomentCreated, { source: "owner_portal" });
    expect(window.dataLayer).toBeUndefined();
  });

  it("does not break a user action if the provider throws", () => {
    window.gtag = vi.fn(() => {
      throw new Error("provider unavailable");
    });
    window.__myPetLinkGaMeasurementId = "G-TEST12345";
    expect(() =>
      trackEvent(AnalyticsEvent.ShareClicked, { surface: "owner_portal" })
    ).not.toThrow();
  });

  it("allows only bounded profile-completion metadata", () => {
    trackEvent(AnalyticsEvent.CompletionActionClicked, {
      surface: "owner_portal",
      completion_item: "moment",
      pet_id: "private-pet-id",
      pet_name: "Milo",
      phone: "+60123456789",
    } as never);

    const event = analyticsCalls().find(
      (call) => call[1] === "completion_action_clicked"
    );
    expect(event?.[2]).toEqual(
      expect.objectContaining({
        surface: "owner_portal",
        completion_item: "moment",
      })
    );
    expect(JSON.stringify(event)).not.toMatch(/private-pet-id|Milo|60123456789/);
  });

  it("allows only the controlled Share Card variant", () => {
    trackEvent(AnalyticsEvent.ShareCardShared, {
      card_variant: "profile",
      pet_name: "Milo",
      slug: "milo-secret-code",
      file_name: "mypetlink-milo-share-card.jpg",
    } as never);

    const event = analyticsCalls().find(
      (call) => call[1] === "share_card_shared"
    );
    expect(event?.[2]).toEqual(
      expect.objectContaining({ card_variant: "profile" })
    );
    expect(JSON.stringify(event)).not.toMatch(
      /Milo|milo-secret-code|mypetlink-milo-share-card/
    );
  });
});
