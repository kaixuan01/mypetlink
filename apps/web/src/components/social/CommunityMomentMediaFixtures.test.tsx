// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialMomentCard } from "@/components/social/SocialMomentCard";
import { communityMomentMediaFixture } from "@/testFixtures/communityMomentMedia";

afterEach(cleanup);

function renderFixture(id: string) {
  const moment = communityMomentMediaFixture(id);
  render(
    <SocialMomentCard
      analyticsSource="explore"
      moment={moment}
      now={Date.parse("2026-09-20T12:00:00+08:00")}
      onLikeChange={vi.fn()}
      signedIn={false}
    />
  );
  return moment;
}

describe("development-only Community Moment media fixtures", () => {
  it("keeps a text-only Moment openable without inventing a media control", () => {
    const moment = renderFixture("c3-text-only");

    expect(screen.queryByRole("region", { name: /media carousel/i })).toBeNull();
    expect(
      document.querySelector(`a[href="/moments/${moment.id}"]`)
    ).toBeTruthy();
    expect(screen.getByText(moment.title)).toBeTruthy();
  });

  it.each([
    ["c3-landscape", "Mochi walking beside a wide blue lake"],
    ["c3-portrait", "Mochi sitting tall beside a sunny window"],
  ])("renders the %s single-image contract", (id, alt) => {
    renderFixture(id);

    const image = screen.getByAltText(alt);
    expect(image.className).toContain("object-contain");
    expect(screen.getByLabelText("Media 1 of 1")).toBeTruthy();
  });

  it("moves through landscape, portrait and square images in one stable carousel", () => {
    renderFixture("c3-multi-image");
    const carousel = screen.getByRole("region", {
      name: "Three shapes of one happy day media carousel",
    });

    expect(carousel.className).toContain("aspect-[4/5]");
    expect(within(carousel).getByLabelText("Media 1 of 3").textContent).toBe(
      "1 / 3"
    );
    fireEvent.click(within(carousel).getByLabelText("Next media"));
    expect(
      within(carousel).getByAltText("Mochi sitting tall beside a sunny window")
    ).toBeTruthy();
    fireEvent.click(within(carousel).getByLabelText("Next media"));
    expect(within(carousel).getByAltText("Mochi beside a bright play ball")).toBeTruthy();
  });

  it("renders a real video contract anonymously, muted and metadata-first", () => {
    renderFixture("c3-video");
    const video = screen.getByLabelText(
      "Mochi playing in a colourful room"
    ) as HTMLVideoElement;

    expect(video.muted).toBe(true);
    expect(video.preload).toBe("metadata");
    expect(video.autoplay).toBe(false);
    expect(screen.getByTestId("like-button-signin")).toBeTruthy();
  });

  it("keeps the supported mixed image/video set in its declared order", () => {
    renderFixture("c3-mixed-media");
    const carousel = screen.getByRole("region", {
      name: "Photo and video playtime media carousel",
    });

    expect(within(carousel).getByAltText("Mochi beside a bright play ball")).toBeTruthy();
    fireEvent.click(within(carousel).getByLabelText("Next media"));
    expect(
      within(carousel).getByLabelText("Mochi playing in a colourful room")
    ).toBeTruthy();
  });
});
