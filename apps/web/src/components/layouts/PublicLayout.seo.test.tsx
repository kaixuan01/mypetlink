// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marketingRoutes } from "@/lib/routes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => false,
}));

const { PublicLayout } = await import("./PublicLayout");

afterEach(cleanup);

describe("PublicLayout crawlable navigation", () => {
  it("links every indexable marketing route with real relative anchors", () => {
    const { container } = render(
      <PublicLayout>
        <p>Page content</p>
      </PublicLayout>
    );
    const hrefs = Array.from(container.querySelectorAll("a[href]")).map(
      (anchor) => anchor.getAttribute("href") ?? ""
    );
    const expectedRoutes = [
      marketingRoutes.howItWorks,
      marketingRoutes.petProfile,
      marketingRoutes.pricing,
      marketingRoutes.privacy,
      marketingRoutes.sample,
      marketingRoutes.smartPetTags,
      marketingRoutes.terms,
    ];

    for (const route of expectedRoutes) {
      expect(hrefs).toContain(route);
    }

    expect(hrefs).not.toContain("");
    expect(hrefs).not.toContain("#");
    expect(
      hrefs
        .filter((href) => !href.startsWith("mailto:"))
        .every((href) => href.startsWith("/"))
    ).toBe(true);
    expect(
      hrefs.some((href) =>
        /^(?:http:|https:\/\/www\.|https:\/\/(?:api|media)\.)/.test(href)
      )
    ).toBe(false);
  });
});
