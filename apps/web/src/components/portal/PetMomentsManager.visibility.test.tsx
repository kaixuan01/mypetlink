// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { PetMoment } from "@/types";

const mocks = vi.hoisted(() => ({
  getPetMoments: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/momentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/momentService")>();
  return {
    ...actual,
    deletePetMoment: vi.fn(),
    getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  };
});
vi.mock("@/components/moments/MomentMediaCarousel", () => ({
  MomentMediaCarousel: () => null,
}));

const { PetMomentsManager } = await import("./PetMomentsManager");

const moments: PetMoment[] = [
  moment("public-compatibility-false", "Public", false, true),
  moment("public-timeline-off", "Public", true, false),
  moment("private-compatibility-true", "Private", true, true),
  moment("legacy-family", "Family Only", true, false),
];

beforeEach(() => {
  mocks.getPetMoments.mockResolvedValue({ data: moments });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PetMomentsManager two-state owner presentation", () => {
  it("keeps one chronological gallery with Shared and Only me classification", async () => {
    render(<PetMomentsManager initialMoments={moments} pet={mockPets[0]} />);

    expect(await screen.findByText("legacy-family")).toBeTruthy();
    expect(summaryValue("Recent moments")).toBe("4");
    expect(summaryValue("Shared moments")).toBe("2");
    expect(summaryValue("Life Timeline")).toBe("2");
    expect(summaryValue("Only me")).toBe("2");
    expect(screen.getAllByText("Shared")).toHaveLength(2);
    expect(screen.getAllByText("Only me")).toHaveLength(3);
    expect(screen.queryByText("Family Only")).toBeNull();
    expect(screen.queryByText("Public Profile")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Family/ })).toBeNull();
  });
});

function summaryValue(label: string) {
  const summaryLabel = screen
    .getAllByText(label)
    .find((element) => element.tagName === "P");
  const card = summaryLabel?.closest(".brand-card");
  return within(card as HTMLElement).getByText(/^\d+$/).textContent;
}

function moment(
  title: string,
  visibility: PetMoment["visibility"],
  showOnPublicProfile: boolean,
  showInLifeTimeline: boolean
): PetMoment {
  return {
    id: title,
    petId: mockPets[0].id,
    title,
    date: "21 Aug 2026",
    type: "Memory",
    caption: "",
    media: [],
    visibility,
    showOnPublicProfile,
    showInLifeTimeline,
  };
}
