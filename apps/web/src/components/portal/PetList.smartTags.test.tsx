// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getAllTags: vi.fn(),
  getOrders: vi.fn(),
}));

vi.mock("@/lib/features", () => ({
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: false,
  smartTagOrderingEnabled: false,
  smartTagsEnabled: true,
  tagOrdersEnabled: true,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => true,
}));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return { ...actual, getPets: mocks.getPets };
});

vi.mock("@/services/tagService", () => ({
  getAllTags: mocks.getAllTags,
  getOrders: mocks.getOrders,
}));

const { PetList } = await import("./PetList");

beforeEach(() => {
  mocks.getPets.mockResolvedValue({ data: [mockPets[0]] });
  mocks.getAllTags.mockResolvedValue({ data: [] });
  mocks.getOrders.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("loads real Smart Tag data in API mode when the feature is enabled", async () => {
  render(<PetList initialOrders={[]} initialPets={[]} initialTags={[]} />);

  expect(await screen.findByText(mockPets[0].name)).toBeTruthy();
  await waitFor(() => {
    expect(mocks.getAllTags).toHaveBeenCalledOnce();
    expect(mocks.getOrders).toHaveBeenCalledOnce();
  });
});
