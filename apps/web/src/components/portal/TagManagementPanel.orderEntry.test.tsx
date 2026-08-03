// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { mockTags } from "@/data/mockTags";
import { ownerRoutes } from "@/lib/routes";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";

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

it("keeps exactly one page-header CTA on a pet-scoped empty state", async () => {
  render(
    <>
      <PageHeader
        title={`${mockPets[0].name}'s MyPetLink Smart Tags`}
        action={
          <CTAButton href={ownerRoutes.tagOrder({ petId: mockPets[0].id })}>
            Order Physical Tag
          </CTAButton>
        }
      />
      <TagManagementPanel
        initialOrders={[]}
        initialTags={[]}
        petId={mockPets[0].id}
        pets={mockPets}
        showOrderAction={false}
      />
    </>
  );

  const links = await screen.findAllByRole("link", { name: "Order Physical Tag" });
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe(
    `/tags/order?petId=${mockPets[0].id}`
  );
  expect(screen.getByText("No physical tags yet")).toBeTruthy();
});

it("does not add another CTA for inactive or archived tag history", async () => {
  const archivedTag = mockTags.find((tag) => tag.status === "Replaced")!;
  mocks.getPetTags.mockResolvedValue({ data: [archivedTag] });

  render(
    <>
      <PageHeader
        title={`${mockPets[0].name}'s MyPetLink Smart Tags`}
        action={
          <CTAButton href={ownerRoutes.tagOrder({ petId: mockPets[0].id })}>
            Order Physical Tag
          </CTAButton>
        }
      />
      <TagManagementPanel
        initialOrders={[]}
        initialTags={[archivedTag]}
        petId={mockPets[0].id}
        pets={mockPets}
        showOrderAction={false}
      />
    </>
  );

  expect(await screen.findAllByRole("link", { name: "Order Physical Tag" })).toHaveLength(1);
  expect(screen.getByText(`${mockPets[0].name} has no active physical tag yet.`)).toBeTruthy();
});
