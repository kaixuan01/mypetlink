// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIMARY_CTA_LABEL } from "@/components/layouts/PublicNav";
import { smartTagOrderingEnabled } from "@/lib/features";
import {
  freePlanLimits,
  smartTagAddOn,
  smartTagAddOnsStatus,
} from "@/lib/planLimits";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/services/sampleExperienceService", () => ({
  getPublicSampleExperience: mocks.load,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import HomePage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const milo = {
  available: true,
  pet: {
    name: "Milo",
    species: "Dog",
    breed: "Golden Retriever",
    ageDisplayLabel: "About 3 years old",
    bio: "Gentle, playful, and happiest near the garden.",
    profilePhotoUrl: "/pets/milo.jpg",
    publicSlug: "milo",
    publicCode: "PUBMILO",
    safetyCode: "SAFE-MILO",
  },
};

describe("homepage pet finder preview", () => {
  it("uses the configured pet's name, image, details, bio, and finder copy", async () => {
    mocks.load.mockResolvedValue(milo);
    render(<HomePage />);

    const preview = (await screen.findByRole("heading", { name: "Milo" })).closest("article");
    expect(preview).toBeTruthy();

    const finderOptions = within(preview!).getByLabelText("Finder contact options");
    const photo = within(preview!).getByRole("img", { name: "Milo's profile" });
    expect(new URL(photo.getAttribute("src")!).pathname).toBe("/pets/milo.jpg");
    expect(photo.getAttribute("width")).toBe("144");
    expect(photo.getAttribute("height")).toBe("144");
    expect(photo.getAttribute("loading")).toBe("lazy");
    expect(preview!.classList.contains("h-[31rem]")).toBe(true);
    expect(within(preview!).getByText("Dog - Golden Retriever - About 3 years old")).toBeTruthy();
    expect(within(preview!).getByText("Gentle, playful, and happiest near the garden.")).toBeTruthy();
    expect(within(preview!).getByText("If someone finds Milo")).toBeTruthy();
    expect(within(finderOptions).getByText("WhatsApp owner")).toBeTruthy();
    expect(within(finderOptions).getByText("Call owner")).toBeTruthy();
    expect(
      within(preview!).getByText("Found location can be shared with the owner.")
    ).toBeTruthy();
    expect(within(preview!).queryByText("Scan to contact owner")).toBeNull();
    expect(within(finderOptions).queryByRole("button")).toBeNull();
    expect(within(finderOptions).queryByRole("link")).toBeNull();
    expect(preview!.textContent).not.toContain("Topu");
  });

  it("refreshes from one configured pet to another without carrying stale content", async () => {
    mocks.load.mockResolvedValueOnce({
      ...milo,
      pet: { ...milo.pet, name: "Pet A", profilePhotoUrl: "/pets/a.jpg" },
    });
    const first = render(<HomePage />);
    expect(await screen.findByRole("heading", { name: "Pet A" })).toBeTruthy();
    first.unmount();

    mocks.load.mockResolvedValueOnce({
      ...milo,
      pet: { ...milo.pet, name: "Pet B", bio: null, breed: null, profilePhotoUrl: null },
    });
    render(<HomePage />);
    expect(await screen.findByRole("heading", { name: "Pet B" })).toBeTruthy();
    expect(screen.queryByText("Pet A")).toBeNull();
    expect(screen.queryByText("Gentle, playful, and happiest near the garden.")).toBeNull();
    expect(screen.getByRole("img", { name: "Pet B profile photo unavailable" })).toBeTruthy();
  });

  it("falls back safely when configuration or the selected image is unavailable", async () => {
    mocks.load.mockResolvedValueOnce(milo);
    const first = render(<HomePage />);
    const image = await screen.findByRole("img", { name: "Milo's profile" });
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "Milo profile photo unavailable" })).toBeTruthy();
    first.unmount();

    mocks.load.mockResolvedValueOnce({ available: false, pet: null });
    render(<HomePage />);
    const genericHeading = await screen.findByRole("heading", {
      name: "Your pet's shareable profile",
    });
    expect(genericHeading).toBeTruthy();
    expect(genericHeading.closest("article")?.classList.contains("h-[31rem]")).toBe(true);
    expect(screen.queryByText("Milo")).toBeNull();
    expect(screen.queryByText("Topu")).toBeNull();
  });

  it("keeps both guided sample destinations reachable from the page", async () => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
    render(<HomePage />);

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/sample#public-share-profile");
    expect(hrefs).toContain("/sample#safety-profile");
  });

  it("labels reminders as future functionality instead of an active promise", () => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
    render(<HomePage />);

    expect(screen.getByText("Reminders coming soon")).toBeTruthy();
    expect(screen.queryByText(/we.?ll remind|automatic reminders|notify you/i)).toBeNull();
  });
});

describe("landing page commercial claims", () => {
  beforeEach(() => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
  });

  function main() {
    return within(screen.getByRole("main"));
  }

  it("takes the free pet allowance from plan configuration", () => {
    render(<HomePage />);

    // The server can override this per plan, so the page must never hardcode it.
    expect(
      main().getAllByText(
        new RegExp(`up to ${freePlanLimits.maxPets} pet`, "i")
      ).length
    ).toBeGreaterThan(0);
    expect(
      main().getByText(
        new RegExp(`${freePlanLimits.maxMemoriesPerPet} pet memories`, "i")
      )
    ).toBeTruthy();
  });

  it("takes the Smart Tag price and billing note from configuration", () => {
    render(<HomePage />);

    expect(main().getAllByText(smartTagAddOn.price).length).toBeGreaterThan(0);
    expect(
      main().getAllByText(new RegExp(smartTagAddOn.billingNote, "i")).length
    ).toBeGreaterThan(0);
  });

  it("offers no purchase action while Smart Tag ordering is disabled", () => {
    // The default build has ordering off and there is no waitlist flow, so
    // nothing on the page may look like a way to buy or reserve a tag.
    expect(smartTagOrderingEnabled).toBe(false);
    render(<HomePage />);

    expect(
      main().queryByRole("link", { name: /get a smart tag|buy|order|notify me/i })
    ).toBeNull();
    expect(
      main().queryByRole("button", { name: /get a smart tag|buy|order|notify me/i })
    ).toBeNull();
    expect(
      main().getAllByText(smartTagAddOnsStatus.status).length
    ).toBeGreaterThan(0);
    expect(
      main().queryByRole("heading", { name: /find mypetlink near you/i })
    ).toBeNull();
  });

  it("does not present Premium or GPS Safety as purchasable", () => {
    render(<HomePage />);

    for (const pattern of [/premium/i, /gps/i]) {
      expect(main().queryByRole("link", { name: pattern })).toBeNull();
      expect(main().queryByRole("button", { name: pattern })).toBeNull();
    }

    expect(
      main().getByText(/planned for later releases/i)
    ).toBeTruthy();
  });

  it("keeps finder contact wording conditional on the owner's settings", () => {
    render(<HomePage />);

    // Contact channels are owner-controlled per pet, so the page must never
    // promise a finder both WhatsApp and a call.
    expect(
      main().getByText(/if you have switched those on/i)
    ).toBeTruthy();
  });
});

describe("landing page structure", () => {
  beforeEach(() => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
  });

  it("has exactly one page-level heading", () => {
    render(<HomePage />);

    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("A safer way home for your pet.");
  });

  it("uses one repeated label for the primary signup action", () => {
    render(<HomePage />);

    // Scoped to the page's own content: the shared header keeps its own
    // navigation controls, which are not part of this convention.
    const primary = within(screen.getByRole("main")).getAllByRole("button", {
      name: new RegExp(PRIMARY_CTA_LABEL, "i"),
    });

    expect(primary).toHaveLength(2);
  });

  it("presents the finder journey as a readable list rather than a scroller", () => {
    render(<HomePage />);

    const journey = screen
      .getByRole("heading", { name: /a stranger can reach you in seconds/i })
      .closest("section");
    expect(journey).toBeTruthy();

    const steps = within(journey!).getAllByRole("listitem");
    expect(steps.length).toBeGreaterThanOrEqual(5);

    // The journey is the page's main explanation, so it must never depend on
    // the visitor discovering a sideways swipe to read it.
    expect(journey!.querySelectorAll('[class*="overflow-x"]')).toHaveLength(0);
  });
});
