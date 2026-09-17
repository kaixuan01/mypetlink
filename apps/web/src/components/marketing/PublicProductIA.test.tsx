// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productNav, primaryPublicNav } from "@/components/layouts/PublicNav";
import { SampleExperience } from "@/components/marketing/SampleExperience";
import { marketingRoutes } from "@/lib/routes";
import { smartTagAddOn, smartTagAddOnsStatus } from "@/lib/planLimits";
import { publicCommerceAvailability } from "@/lib/publicCommerceAvailability";

vi.mock("next/navigation", () => ({
  usePathname: () => "/sample",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/services/sampleExperienceService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/sampleExperienceService")
  >("@/services/sampleExperienceService");

  return {
    ...actual,
    getPublicSampleExperience: () =>
      Promise.resolve({ available: false, pet: null }),
  };
});

/**
 * What the public site says a product is, and where its names lead.
 *
 * The failure these guard against is drift: a menu label that promises a
 * product page and delivers a demo, a price written down twice, or a third
 * official-sounding name for a page that already has one.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

afterEach(cleanup);

describe("product navigation", () => {
  it("sends every product label to a product page", () => {
    const destinations = Object.fromEntries(
      productNav.map((item) => [item.label, item.href])
    );

    expect(destinations["Pet Profiles"]).toBe(marketingRoutes.petProfile);
    expect(destinations["Safety Profile"]).toBe(marketingRoutes.safetyProfile);
    expect(destinations["Smart Tags"]).toBe(marketingRoutes.smartPetTags);
    expect(destinations["How It Works"]).toBe(marketingRoutes.howItWorks);
  });

  it("no longer routes a product name into the sample gallery", () => {
    // "Safety Profile" pointed at /sample#safety-profile, so somebody clicking
    // a product name landed in a demo. A label that says Sample may link to the
    // sample; a label that says Safety Profile may not.
    for (const item of [...productNav, ...primaryPublicNav]) {
      expect(item.href).not.toContain(marketingRoutes.sample);
    }
  });

  it("keeps the sample reachable without making it a product", () => {
    // Hero secondary action, product-page demo CTA and a footer Support link —
    // not a fifth entry in the Product menu.
    expect(productNav.some((item) => item.label === "Sample Profile")).toBe(false);
    expect(read("components/layouts/PublicLayout.tsx")).toContain(
      'label: "Sample Profile"'
    );
    expect(read("components/marketing/LandingHero.tsx")).toContain(
      "See a sample profile"
    );
  });
});

describe("the Safety Profile page", () => {
  const page = () => read("app/safety-profile/page.tsx");

  it("explains the product and ends at the demo", () => {
    // The sample is the closing CTA, which is where linking to it is honest.
    expect(page()).toContain("See the Safety Profile sample");
    expect(page()).toContain("marketingRoutes.sampleSafetyProfile");
  });

  it("answers what a finder sees and what stays private", () => {
    expect(page()).toContain("What a finder sees");
    expect(page()).toContain("What stays private");
    expect(page()).toContain("never your home address");
  });

  it("does not restate How It Works", () => {
    // Four finder steps, not the whole sign-up-to-reunited journey.
    const howItWorks = read("app/how-it-works/page.tsx");
    const shared = ["Create a free pet profile", "Add the Smart Tag"].filter(
      (phrase) => howItWorks.includes(phrase) && page().includes(phrase)
    );

    expect(shared).toHaveLength(0);
  });

  it("keeps the two profiles distinct rather than merging them", () => {
    expect(page()).toContain("Safety Profile");
    expect(page()).toContain("Public Share Profile");
    expect(page()).toContain("marketingRoutes.petProfile");
  });
});

describe("public terminology", () => {
  const publicCopy = [
    "app/page.tsx",
    "app/pet-profile/page.tsx",
    "app/safety-profile/page.tsx",
    "app/sample/page.tsx",
    "app/smart-pet-tags/page.tsx",
    "app/how-it-works/page.tsx",
    "components/marketing/SampleExperience.tsx",
  ];

  it("has one official name for the shareable profile", () => {
    // AGENTS.md names it "Public Share Profile" and permits "Public Profile" /
    // "Share Profile" as short forms. What it must not have is a fourth name
    // that also reads like a product.
    for (const file of publicCopy) {
      const source = read(file);
      expect(source).not.toContain("Public Pet Profile");
      expect(source).not.toContain("mini website");
    }
  });

  it("names Safety Profile the same way everywhere", () => {
    for (const file of publicCopy) {
      const source = read(file);
      expect(source).not.toContain("QR Profile");
      expect(source).not.toContain("QR Safety Page");
      expect(source).not.toContain("QR Safety Profile");
    }
  });

  it("stops calling a staged sample a real situation", () => {
    const sample = read("app/sample/page.tsx");

    expect(sample).not.toContain("two real situations");
    expect(sample).toContain("See how Public Share and Safety Profiles work");
  });
});

describe("Smart Tag product facts", () => {
  const page = () => read("app/smart-pet-tags/page.tsx");

  it("shows the current retail price, from the one place that holds it", () => {
    // The approved customer-facing retail price. Pinned as a literal on
    // purpose: this is the assertion that should fail if somebody changes the
    // number without deciding to, which is exactly how it became RM29.90.
    expect(smartTagAddOn.price).toBe("RM39.90");
    expect(smartTagAddOnsStatus.price).toBe(smartTagAddOn.price);
  });

  it("is written on no page of its own", () => {
    // Every public surface reads the constant, so a price cannot be right on
    // one page and stale on another. (RM0 for the free plan is copy about a
    // plan, not a second copy of this number.)
    for (const file of [
      "app/smart-pet-tags/page.tsx",
      "app/pricing/page.tsx",
      "app/page.tsx",
      "app/where-to-buy/page.tsx",
      "components/marketing/SmartTagShowcase.tsx",
      "components/marketing/LandingHero.tsx",
    ]) {
      expect(read(file)).not.toMatch(/RM\s?\d+\.\d\d/);
    }
  });

  it("does not reach the order flow or wholesale pricing", () => {
    // Three separate facts. Retail display is this constant; an order line
    // takes its amount from the tag catalogue; a merchant sale has its own
    // WholesaleUnitPrice. Collapsing them would make a marketing edit reprice
    // real orders.
    // The constant is a display string, not a number anything can compute with.
    expect(typeof smartTagAddOn.price).toBe("string");
    expect(smartTagAddOn.price).toMatch(/^RM\d+\.\d\d$/);

    for (const file of [
      "components/portal/TagOrderFlow.tsx",
      "services/tagService.ts",
    ]) {
      expect(read(file)).not.toContain("smartTagAddOn");
    }
  });

  it("derives availability from the same rule as Where to Buy", () => {
    // These were two hardcoded facts that could disagree: turning ordering on
    // would publish a buying guide while every page still said Coming Soon.
    const expected = publicCommerceAvailability.onlineOrderingAvailable
      ? "Available now"
      : "Coming Soon";

    expect(smartTagAddOnsStatus.status).toBe(expected);
    expect(read("lib/planLimits.ts")).toContain(
      "publicCommerceAvailability.onlineOrderingAvailable"
    );
  });

  it("does not advertise the discontinued QR-only tag", () => {
    expect(page()).not.toContain("QR Pet Tag");
    expect(page()).toContain("only physical tag");
  });

  it("says plainly that it is not a tracker, without a roadmap promise", () => {
    expect(page()).toContain("does not track your pet");
    expect(page()).not.toContain("GPS Safety is planned");
    expect(page()).not.toContain("later phase");
  });

  it("ends on one action and one way to read further", () => {
    expect(page()).toContain("Get Started Free");
    expect(page()).toContain("Learn how it works");
    // The three equal-weight buttons are gone.
    expect(page()).not.toContain("View Pricing");
    expect(page()).not.toContain("Start With a Free Profile");
  });
});

describe("the Safety Profile sample", () => {
  async function renderSample() {
    const { container } = render(<SampleExperience />);
    // By id: the card has two "Found ...?" headings of its own, which is the
    // point of it — the pet, and the prompt to say where it was found.
    await screen.findByTestId("sample-safety-contact");
    return within(container.querySelector("#safety-profile") as HTMLElement);
  }

  it("shows the finder's contact actions", async () => {
    const card = await renderSample();

    expect(card.getByText("WhatsApp owner")).toBeTruthy();
    expect(card.getByText("Call owner")).toBeTruthy();
  });

  it("shows where the pet is and what to know", async () => {
    const card = await renderSample();

    expect(card.getByText("General area")).toBeTruthy();
    expect(card.getByText(/Bangsar/)).toBeTruthy();
    expect(card.getByText("Safety note")).toBeTruthy();
    expect(card.getByText(/nervous around dogs/)).toBeTruthy();
  });

  it("shows the found-location idea", async () => {
    const card = await renderSample();

    expect(card.getByText("Found this pet?")).toBeTruthy();
    expect(card.getByText("Share found location")).toBeTruthy();
  });

  it("cannot place a real call or expose a real number", async () => {
    const card = await renderSample();
    const scope = card.getByText("WhatsApp owner").closest("article");

    // Sample controls are spans, not links: no tel:, no wa.me, no digits that
    // could be mistaken for somebody's phone number.
    expect(scope?.querySelector('a[href^="tel:"]')).toBeNull();
    expect(scope?.querySelector('a[href*="wa.me"]')).toBeNull();
    expect(scope?.textContent).not.toMatch(/\+?60\d{6,}|01\d[-\s]?\d{7,}/);
    expect(card.getByText(/Sample details only/)).toBeTruthy();
  });

  it("is a rehearsal of the page, not a list of its features", async () => {
    const card = await renderSample();
    const source = read("components/marketing/SampleExperience.tsx");

    // The old card was a large QR mark over three feature bullets, which put
    // the way in ahead of the experience and left it looking half-empty.
    expect(source).not.toContain(
      "WhatsApp owner, call owner, and found-location actions"
    );
    expect(card.queryByText(/No full owner address shown/)).toBeNull();
  });
});
