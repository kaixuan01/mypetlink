// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  ExploreIntro,
  ExploreViewFallback,
} from "@/components/social/ExploreIntro";

afterEach(cleanup);

const read = (path: string) =>
  readFileSync(join(process.cwd(), "src", path), "utf8");

describe("Explore's server-rendered introduction", () => {
  it("gives the page one H1, an explanation, and crawlable links", () => {
    render(<ExploreIntro />);
    const intro = screen.getByTestId("explore-intro");

    expect(
      within(intro).getByRole("heading", { level: 1, name: "Explore pets and pet families" })
    ).toBeTruthy();
    expect(intro.textContent).toMatch(/MyPetLink families in Malaysia/);
    expect(
      within(intro)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/pet-profile", "/safety-profile", "/how-it-works"]);
  });

  it("renders without the browser, so the exported HTML carries it", () => {
    const html = renderToStaticMarkup(<ExploreIntro />);

    expect(html).toContain("<h1");
    expect(html).toContain('href="/pet-profile"');
    // No script, no data: nothing here depends on a request.
    expect(read("components/social/ExploreIntro.tsx")).not.toMatch(/use client|useEffect|fetch\(|Service"/);
  });

  it("names no pet, household or Moment", () => {
    const html = renderToStaticMarkup(
      <>
        <ExploreIntro />
        <ExploreViewFallback />
      </>
    );

    expect(html).not.toMatch(/\/u\/|\/p\/|\/moments\/|media\.mypetlink/);
    expect(html).not.toContain("<img");
  });

  it("sits outside the Suspense boundary, with a real fallback inside it", () => {
    const page = read("app/explore/page.tsx");

    expect(page.indexOf("<ExploreIntro />")).toBeLessThan(page.indexOf("<Suspense"));
    expect(page).toContain("<Suspense fallback={<ExploreViewFallback />}>");
    expect(page).not.toContain("fallback={null}");
  });

  it("shows the loading state in the shape of the view, with no second H1", () => {
    render(<ExploreViewFallback />);
    const fallback = screen.getByTestId("explore-view-fallback");

    expect(fallback.getAttribute("aria-busy")).toBe("true");
    expect(within(fallback).queryByRole("heading", { level: 1 })).toBeNull();
    expect(
      within(fallback)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(["Suggested pets", "Latest Moments"]);
  });

  it("leaves the client view without an H1 of its own", () => {
    expect(read("components/social/SocialExploreView.tsx")).not.toContain("<h1");
  });
});
