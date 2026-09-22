import { describe, expect, it } from "vitest";
import { derivePetCommunityStatus } from "@/lib/communityParticipation";
import type { PetSocialSettings } from "@/services/petSocialSettingsService";

/**
 * Four switches, three honest answers.
 *
 * The one that matters most is the pair: Explore and Search require the pet's
 * discoverability AND the household's (`SocialDiscoveryService`). Reading the
 * pet's alone and calling it "Discoverable" would tell an owner their pet is
 * browsable by strangers when it is not — a privacy claim in the wrong
 * direction, which is the only kind that matters.
 */

function pet(overrides: Partial<PetSocialSettings> = {}): PetSocialSettings {
  return {
    petId: "pet-1",
    name: "Mochi",
    photoUrl: "",
    photoThumbnailUrl: "",
    isSocialEnabled: true,
    isDiscoverable: true,
    canEnableSocial: true,
    missingRequirements: [],
    rowVersion: "v1",
    ...overrides,
  };
}

const base = { ownerSocialEnabled: true, ownerDiscoverable: true, petName: "Mochi" };

describe("discoverability needs both halves", () => {
  it("is discoverable only when the pet and the household both allow it", () => {
    expect(
      derivePetCommunityStatus({ ...base, pet: pet() }).state
    ).toBe("discoverable");
  });

  it.each([
    ["the household is hidden", { ownerDiscoverable: false }, {}],
    ["the pet is hidden", {}, { isDiscoverable: false }],
    ["both are hidden", { ownerDiscoverable: false }, { isDiscoverable: false }],
  ])("is not discoverable when %s", (_label, ownerOverrides, petOverrides) => {
    const status = derivePetCommunityStatus({
      ...base,
      ...ownerOverrides,
      pet: pet(petOverrides),
    });

    expect(status.state).toBe("participating");
    // It may mention browsing — it says the pet is NOT shown to people
    // browsing. What it must never do is claim they can find the pet.
    expect(status.audience).toMatch(/not shown to people browsing/i);
    expect(status.audience).not.toMatch(/can find this pet/i);
    expect(status.label).not.toMatch(/discoverable/i);
  });
});

describe("participation", () => {
  it("is out when the pet has not joined", () => {
    const status = derivePetCommunityStatus({
      ...base,
      pet: pet({ isSocialEnabled: false }),
    });

    expect(status.state).toBe("not-participating");
    expect(status.audience).toContain("Mochi");
  });

  it("is out when the household has not joined, and says so", () => {
    // The pet's own switch is irrelevant while the master is off, and blaming
    // the pet would send the owner to the wrong screen.
    const status = derivePetCommunityStatus({
      ...base,
      ownerSocialEnabled: false,
      pet: pet({ isSocialEnabled: true }),
    });

    expect(status.state).toBe("not-participating");
    expect(status.audience).toMatch(/household has not joined/i);
  });

  it("reports nothing at all when the pet could not be read", () => {
    const status = derivePetCommunityStatus({ ...base, pet: null });

    expect(status.state).toBe("unavailable");
    expect(status.label).toBe("");
  });
});

describe("blockers come from the server's own keys", () => {
  it("names the Share Profile prerequisite", () => {
    const status = derivePetCommunityStatus({
      ...base,
      pet: pet({ isSocialEnabled: false, missingRequirements: ["publicProfile"] }),
    });

    expect(status.blockedReason).toMatch(/Share Profile before adding/);
  });

  it("names the lifecycle prerequisite", () => {
    const status = derivePetCommunityStatus({
      ...base,
      pet: pet({ isSocialEnabled: false, missingRequirements: ["lifecycle"] }),
    });

    expect(status.blockedReason).toMatch(/active pet/i);
  });

  it("says nothing when nothing is in the way", () => {
    expect(derivePetCommunityStatus({ ...base, pet: pet() }).blockedReason).toBe("");
  });

  it("never suggests Community is required for anything", () => {
    // The dependency runs one way. A Share Profile must never be described as
    // needing Community; see docs/architecture/product-model.md.
    for (const missing of [[], ["publicProfile"], ["lifecycle"]]) {
      const status = derivePetCommunityStatus({
        ...base,
        pet: pet({ missingRequirements: missing }),
      });

      expect(status.blockedReason).not.toMatch(/Share Profile.*requires Community/i);
      expect(status.audience).not.toMatch(/Safety Profile/i);
    }
  });
});

describe("every state carries a word, not only a colour", () => {
  it.each([
    [{ ownerSocialEnabled: false }, {}],
    [{}, { isSocialEnabled: false }],
    [{ ownerDiscoverable: false }, {}],
    [{}, {}],
  ])("labels state %#", (ownerOverrides, petOverrides) => {
    const status = derivePetCommunityStatus({
      ...base,
      ...ownerOverrides,
      pet: pet(petOverrides),
    });

    expect(status.label.length).toBeGreaterThan(0);
    expect(status.audience.length).toBeGreaterThan(0);
  });
});
