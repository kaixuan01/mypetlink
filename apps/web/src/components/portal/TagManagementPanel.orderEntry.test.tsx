// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getAllTags: vi.fn(),
  getPetTags: vi.fn(),
  getOrders: vi.fn(),
  getPets: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/features", () => ({
  smartTagOrderingEnabled: true,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));

vi.mock("@/services/tagService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagService")>();
  return {
    ...original,
    getAllTags: (...args: unknown[]) => mocks.getAllTags(...args),
    getPetTags: (...args: unknown[]) => mocks.getPetTags(...args),
    getOrders: (...args: unknown[]) => mocks.getOrders(...args),
  };
});

const { TagManagementPanel } = await import("./TagManagementPanel");

beforeEach(() => {
  mocks.getAllTags.mockResolvedValue({ data: [] });
  mocks.getPetTags.mockResolvedValue({ data: [] });
  mocks.getOrders.mockResolvedValue({ data: [] });
  mocks.getPets.mockResolvedValue({ data: mockPets });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("routes the exact /tags empty-state CTA through shared pet selection", async () => {
  render(
    <TagManagementPanel
      initialOrders={[]}
      initialTags={[]}
      pets={mockPets}
    />
  );

  expect(
    (await screen.findByRole("link", { name: "Order Physical Tag" })).getAttribute(
      "href"
    )
  ).toBe("/tags/order");
});

it("keeps a pet-scoped Smart Tag CTA on that known active pet", async () => {
  render(
    <TagManagementPanel
      initialOrders={[]}
      initialTags={[]}
      petId={mockPets[0].id}
      pets={mockPets}
    />
  );

  expect(
    (await screen.findByRole("link", { name: "Order Physical Tag" })).getAttribute(
      "href"
    )
  ).toBe(`/pets/${mockPets[0].id}/tags/order`);
});
