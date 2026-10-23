// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/script", () => ({
  default: ({ src }: { src: string }) => <span data-ga-script={src} />,
}));

const {
  AnalyticsEvent,
  getAnalyticsMeasurementId,
  initializeAnalytics,
  trackEvent,
  trackPageView,
} = await import("./analytics");
const { AnalyticsProvider } = await import("@/components/analytics/AnalyticsProvider");

// Everything a finder page, a Share Profile or the recap can put in an
// address, a referrer or a title.
const PHONE = "60123456789";
const WHATSAPP = `https://wa.me/${PHONE}?text=Hi%2C%20I%20found%20Milo`;
const SECRETS = [
  PHONE,
  "wa.me/6",
  "text=",
  "found",
  "Milo",
  "milo-secret-code",
  "private-handle",
  "moment-7f3a",
  "pet-4c2e",
  "2026-10-12",
  "2026-10-19",
  "share=",
  "?",
];

function providerCalls() {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as unknown[]));
}

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", { configurable: true, value });
}

function go(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  delete window.dataLayer;
  delete window.gtag;
  delete window.__myPetLinkGaMeasurementId;
  setReferrer("");
  document.title = "MyPetLink";
  nav.pathname = "/";
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("analytics stays off until the stream's settings are verified", () => {
  it.each([
    ["no verification", "G-ABC12345", undefined],
    ["an empty verification", "G-ABC12345", ""],
    ["verification of another stream", "G-ABC12345", "G-OTHER9999"],
    ["a malformed id", "not-an-id", "not-an-id"],
  ])("is off with %s", (_label, id, verified) => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", id);
    if (verified !== undefined) vi.stubEnv("NEXT_PUBLIC_GA_PRIVACY_VERIFIED_ID", verified);

    expect(getAnalyticsMeasurementId()).toBeNull();
    expect(initializeAnalytics()).toBe(false);
    trackPageView("/p/milo-secret-code");
    trackEvent(AnalyticsEvent.MomentCreated, { source: "owner_portal" });
    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();
  });

  it("loads no Google tag at all, so a WhatsApp click cannot be collected", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-ABC12345");
    go("/q/private-safety-code");
    nav.pathname = "/q/private-safety-code";
    render(
      <>
        <AnalyticsProvider />
        <a href={WHATSAPP}>WhatsApp the owner</a>
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "WhatsApp the owner" }));

    expect(document.querySelector("[data-ga-script]")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("runs only for the stream that was verified, whatever the case", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-ABC12345");
    vi.stubEnv("NEXT_PUBLIC_GA_PRIVACY_VERIFIED_ID", " g-abc12345 ");

    expect(getAnalyticsMeasurementId()).toBe("G-ABC12345");
  });
});

describe("what a verified stream is sent", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-ABC12345");
    vi.stubEnv("NEXT_PUBLIC_GA_PRIVACY_VERIFIED_ID", "G-ABC12345");
  });

  it("never carries phone numbers, names, handles, ids, query strings or a full referrer", () => {
    // Arrived from a WhatsApp message on a Share Profile with a query.
    setReferrer(WHATSAPP);
    document.title = "Milo's Share Profile | MyPetLink";
    go("/p/milo-secret-code?share=whatsapp");
    trackPageView(window.location.pathname);

    for (const url of [
      "/u/private-handle?tab=followers",
      "/moments/moment-7f3a?from=feed",
      "/pets/pet-4c2e/moments",
      "/recap?pet=pet-4c2e&week=2026-10-12&from=dashboard",
    ]) {
      document.title = "Milo's week | MyPetLink";
      go(url);
      trackPageView(window.location.pathname);
    }

    // Changing the recap's week replaces the address with the next week.
    go("/recap?pet=pet-4c2e&week=2026-10-19");
    trackEvent(AnalyticsEvent.WeeklyRecapWeekChanged, { direction: "next" });

    const sent = JSON.stringify(providerCalls());
    for (const secret of SECRETS) {
      expect(sent).not.toContain(secret);
    }
    const config = providerCalls().find((call) => call[0] === "config")?.[2] as Record<string, string>;
    expect(config.page_referrer).toBe("https://wa.me");
    expect(config.page_location).toBe("http://localhost:3000/p/[profile]");
    expect(config.page_title).toBe("/p/[profile]");
    const paths = providerCalls()
      .filter((call) => call[0] === "event" && call[1] === "page_view")
      .map((call) => (call[2] as Record<string, string>).page_path);
    expect(paths).toEqual(["/p/[profile]", "/u/[handle]", "/moments/[moment]", "/pets/[pet]/moments", "/recap"]);
  });

  it("keeps the tag's own events on the sanitized page, not the address bar or title", () => {
    document.title = "Milo's week | MyPetLink";
    go("/recap?pet=pet-4c2e&week=2026-10-12");
    trackPageView(window.location.pathname);

    const set = providerCalls().filter((call) => call[0] === "set");
    expect(set.at(-1)?.[1]).toEqual({
      page_location: "http://localhost:3000/recap",
      page_title: "/recap",
    });
  });

  it("sends no page view when only the query changes, as a recap week change does", () => {
    nav.pathname = "/recap";
    go("/recap?pet=pet-4c2e&week=2026-10-12");
    const view = render(<AnalyticsProvider />);
    const pageViews = () =>
      providerCalls().filter((call) => call[0] === "event" && call[1] === "page_view");
    expect(pageViews()).toHaveLength(1);

    go("/recap?pet=pet-4c2e&week=2026-10-19");
    view.rerender(<AnalyticsProvider />);
    expect(pageViews()).toHaveLength(1);

    nav.pathname = "/u/private-handle";
    go("/u/private-handle");
    view.rerender(<AnalyticsProvider />);
    expect(pageViews().map((call) => (call[2] as Record<string, string>).page_path)).toEqual([
      "/recap",
      "/u/[handle]",
    ]);
    expect(document.querySelector("[data-ga-script]")?.getAttribute("data-ga-script")).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-ABC12345"
    );
    expect(JSON.stringify(providerCalls())).not.toMatch(/private-handle|pet-4c2e|2026-10-1/);
  });
});
