// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getPetMoments: vi.fn(),
}));

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));

const { PlanSummaryCard } = await import("./PlanSummaryCard");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("uses dashboard-provided pets and moments without issuing duplicate requests", () => {
  const pet = mockPets[0];
  const moments = [
    {
      ...mockMoments[0],
      petId: pet.id,
    },
  ];

  render(
    <PlanSummaryCard
      initialMoments={moments}
      initialPets={[pet]}
      refreshOnMount={false}
    />
  );

  expect(screen.getByText(`${pet.name} memories`)).toBeTruthy();
  expect(screen.getByText("1 / 10")).toBeTruthy();
  // The compact plan card no longer includes its own Add Pet button.
  expect(screen.queryByRole("link", { name: /add pet/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /add pet/i })).toBeNull();
  expect(mocks.getPets).not.toHaveBeenCalled();
  expect(mocks.getPetMoments).not.toHaveBeenCalled();
});
