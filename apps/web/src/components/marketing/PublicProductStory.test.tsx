// @vitest-environment jsdom

/**
 * The claims the public site makes about what MyPetLink is.
 *
 * These are product-truth guards, not copy snapshots. Each one protects a
 * boundary from `docs/architecture/product-model.md` that a marketing page can
 * blur without anybody noticing: that a Pet Profile is the umbrella and not the
 * `/p/` page, that the Share Profile and the Safety Profile are different
 * pages for different people, that nothing requires buying a Smart Tag, that
 * Community belongs to a household rather than to a pet, and that none of it
 * is a GPS tracker.
 *
 * Whole paragraphs are deliberately not asserted. A claim is protected by the
 * shortest phrase that would have to disappear for the claim to stop being
 * made.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIMARY_CTA_LABEL, productNav } from "@/components/layouts/PublicNav";

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

/** Every surface a first-time visitor reads before signing up. */
const marketingSurfaces = [
  "app/page.tsx",
  "app/pet-profile/page.tsx",
  "app/safety-profile/page.tsx",
  "app/smart-pet-tags/page.tsx",
  "app/how-it-works/page.tsx",
  "app/pricing/page.tsx",
  "app/sample/page.tsx",
  "app/where-to-buy/page.tsx",
  "components/marketing/LandingHero.tsx",
  "components/marketing/FinderJourney.tsx",
  "components/marketing/PetProfilesSection.tsx",
  "components/marketing/CommunityTeaser.tsx",
  "components/marketing/SmartTagShowcase.tsx",
  "components/marketing/SampleExperience.tsx",
];

/**
 * Comments explain decisions to the next developer; they are not read by a
 * visitor. A guard that matched them would fail on its own rationale.
 */
function visibleCopy(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

describe("the first thing a visitor is asked to do", () => {
  it("is creating a profile, not buying a tag", () => {
    expect(PRIMARY_CTA_LABEL).toBe("Create Free Pet Profile");

    const hero = read("components/marketing/LandingHero.tsx");
    expect(hero).toContain("PRIMARY_CTA_LABEL");
    // One conversion action above the fold. The tag may be mentioned there,
    // but never as something to buy.
    expect(hero).not.toContain("Get a Smart Tag");
    expect(hero).not.toContain("Buy");
  });

  it("tells the visitor the tag is optional before they scroll", () => {
    const hero = visibleCopy(read("components/marketing/LandingHero.tsx"));

    expect(hero).toMatch(/optional/i);
  });
});

describe("Pet Profile is the umbrella, not a page", () => {
  it("is never presented as the name of the shareable page", () => {
    for (const file of marketingSurfaces) {
      const copy = visibleCopy(read(file));

      // The failure mode is a sentence that hands "Pet Profile" to the page
      // that already has a name.
      expect(copy).not.toMatch(/Pet Profile is (?:the |your )?(?:page|link)/i);
      expect(copy).not.toMatch(/share (?:your |their )?Pet Profile\b/i);
    }
  });

  it("says on the homepage that one profile carries two public pages", () => {
    const section = visibleCopy(
      read("components/marketing/PetProfilesSection.tsx")
    );

    expect(section).toContain("One Pet Profile, two public pages.");
    expect(section).toMatch(/Share Profile/);
    expect(section).toMatch(/Safety Profile/);
  });
});

describe("Share Profile and Safety Profile stay distinct", () => {
  it("gives each one its own audience wherever both appear", () => {
    const section = visibleCopy(
      read("components/marketing/PetProfilesSection.tsx")
    );

    expect(section).toMatch(/For friends and family/);
    expect(section).toMatch(/For whoever finds your pet/);
  });

  it("uses neither 'Public Profile' nor a QR name for either page", () => {
    for (const file of marketingSurfaces) {
      const copy = visibleCopy(read(file));

      expect(copy).not.toMatch(/\bPublic Profile\b/);
      expect(copy).not.toMatch(/\bQR Profile\b/);
      expect(copy).not.toMatch(/\bNFC Profile\b/i);
      expect(copy).not.toMatch(/\btag profile\b/i);
    }
  });

  it("names which sample a visitor is about to open", () => {
    // "View Sample Profile" could have meant either page.
    for (const file of marketingSurfaces) {
      const copy = visibleCopy(read(file));
      expect(copy).not.toMatch(/View Sample Profile</);
    }

    expect(read("components/marketing/SampleExperience.tsx")).toContain(
      "View Sample Share Profile"
    );
    expect(read("components/marketing/SampleExperience.tsx")).toContain(
      "View Sample Safety Profile"
    );
  });
});

describe("nothing requires buying a Smart Tag", () => {
  it("says so on the tag page itself, where it reads as a requirement", () => {
    const page = visibleCopy(read("app/smart-pet-tags/page.tsx"));

    expect(page).toMatch(/You do not need one/i);
    expect(page).toMatch(/optional/i);
  });

  it("keeps the Safety Profile available without one", () => {
    const safety = visibleCopy(read("app/safety-profile/page.tsx"));

    expect(safety).toMatch(/a physical tag is optional/i);
  });

  it("does not make the tag a required step of the finder journey", () => {
    const journey = visibleCopy(read("components/marketing/FinderJourney.tsx"));

    // A QR code is what the finder meets; a Smart Tag is one way to carry it.
    expect(journey).toContain("They see the QR code");
    expect(journey).toMatch(/printed/i);
  });
});

describe("no GPS claim anywhere", () => {
  const tracking =
    /live (?:gps|location)|real-?time location|geofenc|safe-?zone|track(?:s|ing)? (?:your |the )?pet|continuous location/i;

  /**
   * A denial and a roadmap line both have to say the word. "It does not track
   * your pet" is the sentence we want on the page, so a guard that banned the
   * phrase would ban the correction along with the claim.
   */
  // Deliberately narrow. A bare "no" or "not" appears in almost any stretch
  // of prose, so matching those would let a real claim through as long as some
  // unrelated negative sentence happened to sit nearby.
  const denial =
    /\b(?:does not|do not|never|is not|are not|not a|no live|without)\b/i;

  /**
   * A page that presents GPS as a future product is allowed to name its
   * features anywhere on that page — the list and the "Coming Later" heading
   * that qualifies it are often far apart in the source even when they render
   * side by side.
   */
  const roadmap =
    /coming later|planned for|GPS Safety|future (?:product|release|phase)/i;

  /**
   * A window rather than a sentence: the qualifier is often the heading of the
   * block a list sits in, not a clause in the same line.
   */
  const WINDOW = 500;

  it("mentions tracking only to deny it or to mark it unbuilt", () => {
    for (const file of marketingSurfaces) {
      const copy = visibleCopy(read(file));

      if (roadmap.test(copy)) {
        continue;
      }

      for (const match of copy.matchAll(new RegExp(tracking, "gi"))) {
        const at = match.index ?? 0;
        const context = copy.slice(
          Math.max(0, at - WINDOW),
          at + match[0].length + WINDOW
        );

        expect(
          denial.test(context),
          `${file} claims tracking near: ${copy
            .slice(at, at + 90)
            .replace(/\s+/g, " ")}`
        ).toBe(true);
      }
    }
  });

  it("states the limit rather than leaving it unsaid", () => {
    expect(visibleCopy(read("app/how-it-works/page.tsx"))).toMatch(
      /does not track your pet/i
    );
    expect(visibleCopy(read("app/smart-pet-tags/page.tsx"))).toMatch(
      /not a subscription or a GPS tracker/i
    );
  });
});

describe("Community is a household, and optional", () => {
  it("says a visitor follows a household rather than a pet account", () => {
    const teaser = visibleCopy(read("components/marketing/CommunityTeaser.tsx"));

    expect(teaser).toMatch(/household/i);
    expect(teaser).toMatch(/rather than an individual pet account/i);
  });

  it("says taking part is optional and changes nothing else", () => {
    const teaser = visibleCopy(read("components/marketing/CommunityTeaser.tsx"));

    expect(teaser).toMatch(/optional/i);
    // The dependency runs one way: a Share Profile never needs Community.
    expect(teaser).not.toMatch(/Share Profile requires/i);
  });

  it("is promoted only behind the flag, on the homepage and in the nav", () => {
    const page = read("app/page.tsx");

    // Rendered conditionally rather than always present.
    expect(page).toMatch(/socialEnabled \? <CommunityTeaser \/> : null/);
    expect(read("components/layouts/PublicNav.tsx")).toMatch(
      /socialEnabled[\s\S]{0,120}label: "Community"/
    );
  });

  it("keeps Community out of the product menu, which is about the pet", () => {
    expect(productNav.some((item) => /community/i.test(item.label))).toBe(false);
  });
});
