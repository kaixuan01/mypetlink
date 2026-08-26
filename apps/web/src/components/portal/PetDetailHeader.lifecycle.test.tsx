// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
  };
});

const { PetDetailHeader } = await import("./PetDetailHeader");

beforeEach(() => {
  mocks.getPetById.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("lets the Archived badge carry state while retention copy adds new information", async () => {
  const archived = {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: "Archived" as const,
  };
  mocks.getPetById.mockResolvedValue({ data: archived });

  render(<PetDetailHeader pet={archived} petOrders={[]} tags={[]} />);

  expect(await screen.findByText("Memories and records stay saved.")).toBeTruthy();
  expect(screen.getByText("Archived")).toBeTruthy();
  expect(screen.queryByText(/This pet profile is archived/i)).toBeNull();
  expect(screen.queryByText(/Archived profiles are hidden/i)).toBeNull();
  expect(screen.getByRole("link", { name: "Edit" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /More actions/ })).toBeTruthy();
});
