import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProductionReleaseFlags,
  findReleaseFlagProblems,
  statedReleaseFlags,
} from "@/lib/releaseFlags";

const productionRelease = {
  NEXT_PUBLIC_SMART_TAGS_ENABLED: "true",
  NEXT_PUBLIC_TAG_ORDERS_ENABLED: "true",
  NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED: "true",
  NEXT_PUBLIC_SOCIAL_ENABLED: "true",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production release flags", () => {
  it("accepts the configuration production is built with today", () => {
    expect(findReleaseFlagProblems(productionRelease)).toEqual([]);
    expect(() => assertProductionReleaseFlags("production", productionRelease)).not.toThrow();
  });

  it("accepts an explicit pre-sale configuration", () => {
    expect(
      findReleaseFlagProblems({
        NEXT_PUBLIC_SMART_TAGS_ENABLED: "false",
        NEXT_PUBLIC_TAG_ORDERS_ENABLED: "false",
        NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED: "false",
        NEXT_PUBLIC_SOCIAL_ENABLED: "false",
      })
    ).toEqual([]);
  });

  it.each(statedReleaseFlags)(
    "refuses a production build that leaves %s to its default",
    (key) => {
      // An omitted variable used to fall back to OFF silently — relabelling the
      // Smart Tag "Coming Soon" and dropping pages from the sitemap.
      const env = { ...productionRelease, [key]: undefined };

      expect(() => assertProductionReleaseFlags("production", env)).toThrow(key);
    }
  );

  it("refuses a value that is neither true nor false", () => {
    expect(() =>
      assertProductionReleaseFlags("production", {
        ...productionRelease,
        NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED: "yes",
      })
    ).toThrow(/NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED/);
  });

  it.each([
    ["NEXT_PUBLIC_SMART_TAGS_ENABLED"],
    ["NEXT_PUBLIC_TAG_ORDERS_ENABLED"],
  ])("refuses ordering on with %s off, which would sell a tag nobody can check out", (key) => {
    expect(() =>
      assertProductionReleaseFlags("production", { ...productionRelease, [key]: "false" })
    ).toThrow(/requires/);
  });

  it("never interferes with local development or tests", () => {
    expect(() => assertProductionReleaseFlags("development", {})).not.toThrow();
    expect(() => assertProductionReleaseFlags("test", {})).not.toThrow();
  });
});

describe("Smart Tag purchase availability", () => {
  async function loadWith(env: Record<string, string>) {
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    vi.resetModules();
    const features = await import("@/lib/features");
    const commerce = await import("@/lib/publicCommerceAvailability");
    const plan = await import("@/lib/planLimits");
    return { features, commerce, plan };
  }

  it("says Available now, and offers Where to Buy, when checkout is open", async () => {
    const { features, commerce, plan } = await loadWith(productionRelease);

    expect(features.smartTagPurchaseEnabled).toBe(true);
    expect(commerce.publicCommerceAvailability.onlineOrderingAvailable).toBe(true);
    expect(commerce.publicCommerceAvailability.showWhereToBuy).toBe(true);
    expect(plan.smartTagAddOnsStatus.status).toBe("Available now");
    expect(plan.smartTagAddOnsStatus.shortDescription).not.toMatch(/coming soon/i);
  });

  it("says Coming Soon when ordering is off", async () => {
    const { features, commerce, plan } = await loadWith({
      ...productionRelease,
      NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED: "false",
    });

    expect(features.smartTagPurchaseEnabled).toBe(false);
    expect(commerce.publicCommerceAvailability.showWhereToBuy).toBe(false);
    expect(plan.smartTagAddOnsStatus.status).toBe("Coming Soon");
  });

  it("does not claim Available now when the order pages are closed", async () => {
    // Ordering on with tag orders off used to say "Available now" on every
    // public page while the checkout answered "Smart Tags coming soon".
    const { features, plan } = await loadWith({
      ...productionRelease,
      NEXT_PUBLIC_TAG_ORDERS_ENABLED: "false",
    });

    expect(features.smartTagOrderingEnabled).toBe(true);
    expect(features.smartTagPurchaseEnabled).toBe(false);
    expect(plan.smartTagAddOnsStatus.status).toBe("Coming Soon");
  });

  it("keeps Premium Coming Soon and GPS Safety Coming Later whatever the tag does", async () => {
    for (const ordering of ["true", "false"]) {
      const { plan } = await loadWith({
        ...productionRelease,
        NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED: ordering,
      });

      expect(plan.premiumPlan.status).toBe("Coming Soon");
      expect(plan.gpsSafety.status).toBe("Coming Later");
    }
  });
});
