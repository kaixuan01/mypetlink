import { describe, expect, it } from "vitest";
import { samplePet } from "@/data/samplePet";
import {
  getAvailablePetShareCardOptions,
  addPublicProfileShareVersion,
  getPublicProfileSocialDescription,
  getPetShareCardFileName,
  getPublicProfileShareCardImagePath,
  getPublicProfileSocialTitle,
  getPublicProfileShareVersion,
  getPublicProfileSocialImagePath,
  isPublicProfileShareable,
  toPublicProfileSocialCardData,
} from "@/lib/publicProfileSocial";
import { toPublicProfile } from "@/services/petService";

describe("public profile social sharing", () => {
  it("builds dynamic, safely cleaned social copy", () => {
    expect(getPublicProfileSocialTitle("Nori")).toBe("Meet Nori | MyPetLink");
    expect(getPublicProfileSocialDescription("Nori")).toBe(
      "View Nori's public profile, memories, and important safety information."
    );
    expect(getPublicProfileSocialDescription("  O'Malley\u0000  ")).toBe(
      "View O'Malley's public profile, memories, and important safety information."
    );
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

  it("uses the API-owned public profile version when available", () => {
    const profile = {
      ...toPublicProfile(samplePet),
      publicProfileVersion: "0123456789abcdef",
    };

    expect(getPublicProfileShareVersion(profile)).toBe("0123456789abcdef");
    expect(getPublicProfileSocialImagePath(profile)).toBe(
      "/social/pets/topu-pnpr4ipnr6ppelnsn.jpg?v=0123456789abcdef"
    );
    expect(getPublicProfileShareCardImagePath(profile)).toBe(
      "/social/pets/topu-pnpr4ipnr6ppelnsn.jpg?v=0123456789abcdef&variant=share-card"
    );
  });

  it("creates a bounded filename without identifiers or unsafe characters", () => {
    expect(getPetShareCardFileName("  Mílo / ../../ Owner  ")).toBe(
      "mypetlink-milo-owner-share-card.jpg"
    );
    expect(getPetShareCardFileName("🐾")).toBe(
      "mypetlink-pet-share-card.jpg"
    );
    expect(getPetShareCardFileName("A".repeat(100)).length).toBeLessThanOrEqual(
      65
    );
    expect(getPetShareCardFileName("Milo", "birthday")).toBe(
      "mypetlink-milo-birthday-card.jpg"
    );
  });

  it("offers only eligible card variants for the Malaysia calendar day", () => {
    const profile = {
      ...toPublicProfile(samplePet),
      birthday: "2025-08-17",
      adoptionDay: "2022-08-17",
      lifecycleStatus: "Active" as const,
      publicProfileVersion: "0123456789abcdef",
    };

    const full = getAvailablePetShareCardOptions(
      profile,
      new Date("2026-08-16T16:00:00Z")
    );
    expect(full.map((option) => option.variant)).toEqual([
      "profile",
      "birthday",
    ]);
    expect(full[1].imagePath).toContain("variant=birthday");

    expect(
      getAvailablePetShareCardOptions(
        { ...profile, birthday: "" },
        new Date("2026-08-16T16:00:00Z")
      ).map((option) => option.variant)
    ).toEqual(["profile"]);
  });

  it("retains a deterministic local fallback before an API version is available", () => {
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
    expect(addPublicProfileShareVersion("/p/topu-code", "abc123")).toBe(
      "/p/topu-code?share=abc123"
    );
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
});
