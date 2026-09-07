import { describe, expect, it } from "vitest";
import {
  REFERRAL_ATTRIBUTION_STORAGE_KEY,
  captureReferralFromUrl,
  readStoredReferral,
} from "./referralAttribution";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const now = new Date("2026-09-07T12:00:00.000Z");

describe("referral attribution capture", () => {
  it("captures a normalized first touch and removes only ref from the URL", () => {
    const store = storage();
    const cleaned = captureReferralFromUrl(
      "https://mypetlink.com.my/pricing?utm_source=test&ref=amanda#tags",
      store,
      now,
      false
    );

    expect(cleaned).toBe("/pricing?utm_source=test#tags");
    expect(readStoredReferral(store, now)).toEqual({
      code: "AMANDA",
      capturedAt: now.toISOString(),
    });
  });

  it("does not overwrite an existing valid first touch", () => {
    const store = storage();
    captureReferralFromUrl("https://mypetlink.com.my/?ref=FIRST", store, now, false);
    captureReferralFromUrl("https://mypetlink.com.my/?ref=SECOND", store, now, false);
    expect(readStoredReferral(store, now)?.code).toBe("FIRST");
  });

  it("ignores malformed and authenticated-owner referral visits", () => {
    const malformed = storage();
    expect(captureReferralFromUrl("https://mypetlink.com.my/?ref=A-!", malformed, now, false)).toBe("/");
    expect(malformed.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY)).toBeNull();

    const signedIn = storage();
    captureReferralFromUrl("https://mypetlink.com.my/?ref=AMANDA", signedIn, now, true);
    expect(signedIn.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("expires saved candidates after 90 days and accepts a later first touch", () => {
    const store = storage();
    const old = new Date("2026-05-01T00:00:00.000Z");
    captureReferralFromUrl("https://mypetlink.com.my/?ref=OLD", store, old, false);
    captureReferralFromUrl("https://mypetlink.com.my/?ref=NEW", store, now, false);
    expect(readStoredReferral(store, now)?.code).toBe("NEW");
  });
});
