import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The space the floating bottom bar is owed, and who owes it.
 *
 * jsdom has no layout engine, so nothing here measures a pixel. What it can hold
 * still is the arithmetic and the ownership: one token describes how much room
 * the bar takes, one shell applies it, and no page pads around the problem on
 * its own. The rendered result — the bar covering nothing on Dashboard, Pets,
 * Smart Tags, Orders, Owner Settings, Feed, Explore and Community Profile — is
 * confirmed in a real browser and recorded separately.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, relative), "utf8");

const css = read("src/app/globals.css");

function declaration(name: string) {
  const match = css.match(new RegExp(`${name}:([^;]+);`));
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

describe("the bottom bar's reserved space", () => {
  it("reserves the bar, the safe area and room to breathe", () => {
    const clearance = declaration("--owner-mobile-page-bottom-clearance");

    expect(clearance).toContain("var(--owner-bottom-nav-height)");
    expect(clearance).toContain("env(safe-area-inset-bottom)");

    // The brief's formula, and the reason it is a sum rather than one number:
    // a phone with a home indicator owes more than one without.
    const breathing = clearance?.match(/\+\s*([\d.]+)rem\s*\)/)?.[1];
    expect(Number(breathing)).toBeGreaterThanOrEqual(1);
    expect(Number(breathing)).toBeLessThanOrEqual(1.5);
  });

  it("describes the height the bar actually occupies", () => {
    const height = declaration("--owner-bottom-nav-height");

    // 56px item row + 16px container padding + 2 hairlines = 74px, floating 12px
    // above the edge, so the bar covers 86px. The token has to be at least that
    // or the last card tucks under the bar's shadow.
    expect(Number(height?.replace("rem", ""))).toBeGreaterThanOrEqual(86 / 16);
  });

  it("applies the clearance once, in the shared shell", () => {
    const shell = read("src/components/layouts/AppLayout.tsx");

    expect(shell).toContain("pb-[var(--owner-mobile-page-bottom-clearance)]");
  });

  it("is not re-solved page by page", () => {
    const pages = [
      "src/app/dashboard/page.tsx",
      "src/app/pets/page.tsx",
      "src/app/tags/page.tsx",
      "src/app/orders/page.tsx",
      "src/app/settings/page.tsx",
      "src/app/feed/page.tsx",
      "src/app/explore/page.tsx",
      "src/app/community/profile/page.tsx",
    ];

    for (const page of pages) {
      const source = read(page);

      // A page that pads for the bar itself is a page that will be forgotten
      // when the bar changes height.
      expect(source).not.toContain("owner-bottom-nav-height");
      expect(source).not.toContain("owner-mobile-page-bottom-clearance");
    }
  });
});

describe("the bar itself", () => {
  const shell = read("src/components/layouts/MobileBottomNavShell.tsx");

  it("sits above the safe area rather than under it", () => {
    expect(shell).toContain("bottom-[calc(0.75rem+env(safe-area-inset-bottom))]");
  });

  it("is one bar, not one per half of the product", () => {
    const community = read("src/components/layouts/SocialBottomNav.tsx");
    const pets = read("src/components/layouts/MobileBottomNav.tsx");

    // Community and My Pets supply items; the container, its safe-area offset,
    // the touch targets and the active treatment are decided in one place.
    // Anything either half positions against the bar — the More sheet — derives
    // its offset from the bar's own token rather than a number tuned to match.
    for (const source of [community, pets]) {
      expect(source).toContain("MobileBottomNavShell");
      expect(source).not.toMatch(/bottom-\[calc\(\d/);
    }
  });
});
