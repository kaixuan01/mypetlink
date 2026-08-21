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
