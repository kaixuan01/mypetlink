import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMediaUrl } from "./mediaUrl";

describe("resolveMediaUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns an absolute public media URL unchanged", () => {
    const url =
      "https://media.mypetlink.com.my/pets/abc/profile/photo.jpg";
    expect(resolveMediaUrl(url)).toBe(url);
  });

  it("passes through local data-URL previews", () => {
    expect(resolveMediaUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  it("returns empty for missing values", () => {
    expect(resolveMediaUrl(undefined)).toBe("");
    expect(resolveMediaUrl(null)).toBe("");
    expect(resolveMediaUrl("")).toBe("");
    expect(resolveMediaUrl("   ")).toBe("");
  });

  it("never emits a route-relative URL for a bare object key when no media base is set", () => {
    // Guards the production bug: a relative value would be requested from the
    // frontend origin (e.g. mypetlink.com.my/pets/{id}/...).
    expect(resolveMediaUrl("pets/abc/profile/photo.jpg")).toBe("");
  });

  it("never emits a URL that contains a private bucket segment", () => {
    expect(
      resolveMediaUrl("mypetlink-private-files/pets/abc/profile/photo.jpg")
    ).toBe("");
  });
});

describe("resolveMediaUrl with a configured media base", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function withBase(base: string) {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", base);
    vi.resetModules();
    return (await import("./mediaUrl")).resolveMediaUrl;
  }

  it("joins a bare object key onto the configured base", async () => {
    const resolve = await withBase("https://media.mypetlink.com.my");
    expect(resolve("pets/abc/profile/photo.jpg")).toBe(
      "https://media.mypetlink.com.my/pets/abc/profile/photo.jpg"
    );
  });

  it("normalizes a leading slash and trailing base slash without doubling", async () => {
    const resolve = await withBase("https://media.mypetlink.com.my/");
    expect(resolve("/pets/abc/profile/photo.jpg")).toBe(
      "https://media.mypetlink.com.my/pets/abc/profile/photo.jpg"
    );
  });

  it("strips a stray bucket-name prefix from a legacy object key", async () => {
    const resolve = await withBase("https://media.mypetlink.com.my");
    expect(
      resolve("mypetlink-private-files/pets/abc/profile/photo.jpg")
    ).toBe("https://media.mypetlink.com.my/pets/abc/profile/photo.jpg");
  });
});
