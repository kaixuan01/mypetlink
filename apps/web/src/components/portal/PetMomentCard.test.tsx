// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PetMoment } from "@/types";
import { PetMomentCard } from "./PetMomentCard";

vi.mock("@/components/moments/MomentMediaCarousel", () => ({
  MomentMediaCarousel: () => null,
}));

afterEach(cleanup);

describe("PetMomentCard owner audience badges", () => {
  it.each([
    { visibility: "Public" as const, expected: "Shared" },
    { visibility: "Private" as const, expected: "Only me" },
    { visibility: "Family Only" as const, expected: "Only me" },
  ])("shows $visibility as $expected", ({ visibility, expected }) => {
    render(<PetMomentCard moment={moment({ visibility })} />);

    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.queryByText("Family Only")).toBeNull();
    expect(screen.queryByText("Public Profile")).toBeNull();
  });

  it("keeps Timeline placement separate from audience compatibility fields", () => {
    const { rerender } = render(
      <PetMomentCard
        moment={moment({
          visibility: "Public",
          showOnPublicProfile: false,
          showInLifeTimeline: true,
        })}
      />
    );

    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.getByText("In Life Timeline")).toBeTruthy();

    rerender(
      <PetMomentCard
        moment={moment({
          visibility: "Private",
          showOnPublicProfile: true,
          showInLifeTimeline: true,
        })}
      />
    );
    expect(screen.getByText("Only me")).toBeTruthy();
    expect(screen.getByText("In Life Timeline")).toBeTruthy();
    expect(screen.queryByText("Public Profile")).toBeNull();
  });

  it("gives a long title two mobile lines before the owner badge metadata", () => {
    const longTitle =
      "The afternoon Milo discovered every puddle in the park and made three new friends";
    const { container } = render(
      <PetMomentCard
        moment={moment({
          title: longTitle,
          visibility: "Public",
          showInLifeTimeline: true,
        })}
      />
    );

    const title = screen.getByRole("heading", { name: longTitle });
    const heading = container.querySelector("[data-moment-heading]");
    const badges = container.querySelector("[data-moment-badges]");

    expect(title.textContent).toBe(longTitle);
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).toContain("sm:line-clamp-none");
    expect(heading?.className).toContain("flex-col");
    expect(heading?.className).toContain("sm:flex-row");
    expect(
      title.compareDocumentPosition(badges as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.getByText("In Life Timeline")).toBeTruthy();
  });
});

function moment(overrides: Partial<PetMoment>): PetMoment {
  return {
    id: "moment-card",
    petId: "pet-card",
    title: "A Moment",
    date: "21 Aug 2026",
    type: "Memory",
    caption: "",
    media: [],
    visibility: "Private",
    showOnPublicProfile: false,
    showInLifeTimeline: false,
    ...overrides,
  };
}
