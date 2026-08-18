import { afterEach, describe, expect, it, vi } from "vitest";

const featureEnvKeys = [
  "NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED",
  "NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED",
  "NEXT_PUBLIC_SMART_TAGS_ENABLED",
  "NEXT_PUBLIC_TAG_ORDERS_ENABLED",
  "NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("owner product availability", () => {
  it("uses the current release defaults", async () => {
    for (const key of featureEnvKeys) {
      vi.stubEnv(key, "");
    }
    vi.resetModules();

    const features = await import("./features");

    expect(features.ownerProductFeatures).toEqual({
      publicProfilesEnabled: true,
      safetyProfilesOwnerUiEnabled: false,
      smartTagsEnabled: false,
      tagOrdersEnabled: false,
    });
    expect(features.smartTagOrderingEnabled).toBe(false);
  });

  it("can restore owner UI without changing route implementations", async () => {
    for (const key of featureEnvKeys) {
      vi.stubEnv(key, "true");
    }
    vi.resetModules();

    const features = await import("./features");

    expect(features.ownerProductFeatures).toEqual({
      publicProfilesEnabled: true,
      safetyProfilesOwnerUiEnabled: true,
      smartTagsEnabled: true,
      tagOrdersEnabled: true,
    });
    expect(features.smartTagOrderingEnabled).toBe(true);
  });

  it("never exposes tag Orders in navigation without Smart Tags", async () => {
    vi.stubEnv("NEXT_PUBLIC_SMART_TAGS_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_TAG_ORDERS_ENABLED", "true");
    vi.resetModules();

    const features = await import("./features");

    expect(features.tagOrdersEnabled).toBe(false);
  });
});
