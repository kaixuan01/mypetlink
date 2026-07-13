import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getSocialImage } from "@/app/share/pets/[slug]/route";
import { samplePet } from "@/data/samplePet";
import {
  addPublicProfileShareVersion,
  getPublicProfileShareVersion,
  isPublicProfileShareable,
  toPublicProfileSocialCardData,
} from "@/lib/publicProfileSocial";
import { createPublicProfileSocialImage } from "@/lib/publicProfileSocialImage";
import { toPublicProfile } from "@/services/petService";

describe("public profile social sharing", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  });

  it("projects only public card fields and never owner or safety details", () => {
    const profile = toPublicProfile(samplePet);
    const card = toPublicProfileSocialCardData(profile);
    const serialized = JSON.stringify(card);

    expect(card.name).toBe("Topu");
    expect(card.summary).toContain("Cat");
    expect(card.summary).toContain("Domestic Shorthair");
    expect(serialized).not.toContain("owner");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("whatsapp");
    expect(serialized).not.toContain(profile.safetyNote);
    expect(serialized).not.toContain(profile.emergencyNote);
  });

  it("changes the version when relevant public profile data changes", () => {
    const profile = toPublicProfile(samplePet);
    const original = getPublicProfileShareVersion(profile);

    expect(
      getPublicProfileShareVersion({ ...profile, name: "Topu Junior" })
    ).not.toBe(original);
    expect(
      getPublicProfileShareVersion({ ...profile, lostModeEnabled: true })
    ).not.toBe(original);
    expect(
      getPublicProfileShareVersion({
        ...profile,
        photoUrl: `${profile.photoUrl}?updated=1`,
      })
    ).not.toBe(original);
  });

  it("adds a harmless share version without changing the canonical path", () => {
    expect(
      addPublicProfileShareVersion("/p/topu-code", "abc123")
    ).toBe("/p/topu-code?share=abc123");
    expect(
      addPublicProfileShareVersion("/p/topu-code?from=owner", "abc123")
    ).toBe("/p/topu-code?from=owner&share=abc123");
  });

  it("treats archived profiles as unavailable", () => {
    const profile = toPublicProfile(samplePet);
    expect(isPublicProfileShareable(profile)).toBe(true);
    expect(
      isPublicProfileShareable({ ...profile, lifecycleStatus: "Archived" })
    ).toBe(false);
  });

  it("returns a compact 1200 by 630 JPEG from the static endpoint", async () => {
    const response = await getSocialImage(
      new Request("https://mypetlink.com.my/share/pets/milo-k7q2.jpg"),
      { params: Promise.resolve({ slug: "milo-k7q2.jpg" }) }
    );
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(readJpegDimensions(bytes)).toEqual({ width: 1200, height: 630 });
    expect(bytes.length).toBeLessThan(600 * 1024);
  }, 15000);

  it("returns a generic image safely for an invalid image slug", async () => {
    const response = await getSocialImage(
      new Request("https://mypetlink.com.my/share/pets/not-a-profile.jpg"),
      { params: Promise.resolve({ slug: "not-a-profile.jpg" }) }
    );
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(readJpegDimensions(bytes)).toEqual({ width: 1200, height: 630 });
  }, 15000);

  it("renders photo fallbacks and a lost-mode card without failing", async () => {
    const base = toPublicProfileSocialCardData(toPublicProfile(samplePet));
    const response = await createPublicProfileSocialImage(
      {
        ...base,
        coverUrl: undefined,
        lostModeEnabled: true,
        photoUrl: undefined,
      },
      { loadMedia: async () => null }
    );
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(readJpegDimensions(bytes)).toEqual({ width: 1200, height: 630 });
  }, 15000);
});

function readJpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += length + 2;
  }

  throw new Error("JPEG dimensions were not found.");
}
