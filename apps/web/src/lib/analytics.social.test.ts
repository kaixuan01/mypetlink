// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  toAnalyticsCountBucket,
  toAnalyticsQueryLengthBucket,
  trackEvent,
} from "@/lib/analytics";

/**
 * The analytics contract for Social.
 *
 * The system drops keys and values it does not recognise, which makes it the
 * right place to prove a negative: there is no route through which a search
 * query, a pet name or a handle reaches a third party.
 */

const sent: unknown[][] = [];

beforeEach(() => {
  sent.length = 0;
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123456");

  window.__myPetLinkGaMeasurementId = undefined;
  window.dataLayer = [];
  window.gtag = (...args: unknown[]) => {
    sent.push(args);
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.gtag;
  delete window.__myPetLinkGaMeasurementId;
});

function lastEvent(name: string) {
  const entry = [...sent]
    .reverse()
    .find((args) => args[0] === "event" && args[1] === name);

  return entry?.[2] as Record<string, unknown> | undefined;
}

describe("social analytics", () => {
  it("sends the feed's two events with distinct meanings", () => {
    trackEvent("social_feed_viewed", { source: "feed" });
    trackEvent("social_feed_page_loaded", { source: "feed" });

    expect(lastEvent("social_feed_viewed")).toMatchObject({ source: "feed" });
    expect(lastEvent("social_feed_page_loaded")).toMatchObject({ source: "feed" });
  });

  it("records where a follow happened, and never who was followed", () => {
    trackEvent("pet_followed", { source: "explore" });

    const payload = lastEvent("pet_followed");

    expect(payload).toMatchObject({ source: "explore" });
    expect(Object.keys(payload ?? {})).not.toContain("handle");
    expect(Object.keys(payload ?? {})).not.toContain("pet_id");
  });

  it("records a like by surface only", () => {
    trackEvent("moment_liked", { source: "feed" });
    trackEvent("moment_unliked", { source: "direct" });

    expect(lastEvent("moment_liked")).toMatchObject({ source: "feed" });
    expect(lastEvent("moment_unliked")).toMatchObject({ source: "direct" });
  });

  it("describes a search in buckets and carries no query text", () => {
    trackEvent("social_search_performed", {
      source: "search",
      result_tab: "pets",
      result_count_bucket: "1_5",
      query_length_bucket: "4_8",
    });

    const payload = lastEvent("social_search_performed");

    expect(payload).toMatchObject({
      source: "search",
      result_tab: "pets",
      result_count_bucket: "1_5",
      query_length_bucket: "4_8",
    });
  });

  it("drops raw search text even when something tries to send it", () => {
    trackEvent("social_search_performed", {
      source: "search",
      result_tab: "pets",
      result_count_bucket: "0",
      query_length_bucket: "2_3",
      // @ts-expect-error — the type forbids it; this proves the runtime does too.
      q: "mochi",
      query: "mochi",
      pet_name: "Mochi",
      handle: "tanfamily",
    });

    const payload = lastEvent("social_search_performed") ?? {};

    expect(payload.q).toBeUndefined();
    expect(payload.query).toBeUndefined();
    expect(payload.pet_name).toBeUndefined();
    expect(payload.handle).toBeUndefined();
  });

  it("drops a source value that is not in the allowlist", () => {
    trackEvent("pet_followed", {
      // @ts-expect-error — deliberately outside the allowed set.
      source: "somewhere_else",
    });

    expect(lastEvent("pet_followed")?.source).toBeUndefined();
  });

  it("records which kind of profile was opened, never which one", () => {
    trackEvent("social_profile_viewed", { source: "direct", profile_type: "owner" });

    const payload = lastEvent("social_profile_viewed");

    expect(payload).toMatchObject({ profile_type: "owner", source: "direct" });
    expect(Object.keys(payload ?? {})).not.toContain("handle");
  });

  it("records the safety bridge click with the Lost Mode state", () => {
    trackEvent("safety_to_public_profile_clicked", {
      source: "safety",
      lost_mode: "on",
    });

    expect(lastEvent("safety_to_public_profile_clicked")).toMatchObject({
      source: "safety",
      lost_mode: "on",
    });
  });

  it("never sends a safety code, a tag code or a pet id on any social event", () => {
    trackEvent("social_profile_viewed", { source: "explore", profile_type: "pet" });
    trackEvent("moment_liked", { source: "explore" });
    trackEvent("safety_to_public_profile_clicked", {
      source: "safety",
      lost_mode: "off",
    });

    const serialized = JSON.stringify(sent);

    for (const forbidden of ["safetyCode", "tagCode", "publicCode", "pet_id", "moment_id"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("analytics buckets", () => {
  it("buckets result counts without recording the number", () => {
    expect(toAnalyticsCountBucket(0)).toBe("0");
    expect(toAnalyticsCountBucket(1)).toBe("1_5");
    expect(toAnalyticsCountBucket(5)).toBe("1_5");
    expect(toAnalyticsCountBucket(6)).toBe("6_plus");
    expect(toAnalyticsCountBucket(400)).toBe("6_plus");
  });

  it("buckets query length without recording the query", () => {
    expect(toAnalyticsQueryLengthBucket(2)).toBe("2_3");
    expect(toAnalyticsQueryLengthBucket(3)).toBe("2_3");
    expect(toAnalyticsQueryLengthBucket(4)).toBe("4_8");
    expect(toAnalyticsQueryLengthBucket(8)).toBe("4_8");
    expect(toAnalyticsQueryLengthBucket(9)).toBe("9_plus");
  });
});
