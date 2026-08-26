// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => true,
}));
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return { ...actual, getPets: (...args: unknown[]) => mocks.getPets(...args) };
});

const { PetList } = await import("./PetList");

const activePet = { ...mockPets[0], name: "Active companion" };
const privatePet = {
  ...mockPets[1],
  id: "pet_private",
  name: "Private companion",
  publicProfileEnabled: false,
};
const memorialPet = {
  ...structuredClone(mockPets[1]),
  id: "pet_memorial",
  name: "Memorial companion",
  lifecycleStatus: "Memorial" as const,
};
const archivedPet = {
  ...structuredClone(mockPets[0]),
  id: "pet_archived",
  name: "Archived companion",
  lifecycleStatus: "Archived" as const,
  previousLifecycleStatus: "Active" as const,
};

beforeEach(() => {
  mocks.getPets.mockResolvedValue({
    data: [activePet, privatePet, memorialPet, archivedPet],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps every status filter directly named and preserves filter semantics", async () => {
  render(<PetList initialOrders={[]} initialPets={[]} initialTags={[]} />);

  await screen.findByText(activePet.name);
  const tabList = screen.getByRole("tablist", { name: "Filter pet profiles" });
  const tabs = within(tabList).getAllByRole("tab");

  expect(tabs).toHaveLength(4);
  expect(tabList.getAttribute("data-segmented-tabs-density")).toBe("compact");
  expect(within(tabList).queryByRole("button", { name: "More" })).toBeNull();

  const activeTab = within(tabList).getByRole("tab", { name: "Active" });
  expect(activeTab.getAttribute("aria-selected")).toBe("true");
  expect(activeTab.classList.contains("min-h-11")).toBe(true);
  const privateCard = screen.getByText(privatePet.name).closest("article")!;
  expect(within(privateCard).getByText("Private")).toBeTruthy();

  const memorialTab = within(tabList).getByRole("tab", { name: "Memorial" });
  fireEvent.click(memorialTab);
  expect(memorialTab.getAttribute("aria-selected")).toBe("true");
  const memorialCard = screen.getByText(memorialPet.name).closest("article")!;
  expect(within(memorialCard).getByText("Memorial")).toBeTruthy();

  const archivedTab = within(tabList).getByRole("tab", { name: "Archived" });
  fireEvent.click(archivedTab);
  expect(archivedTab.getAttribute("aria-selected")).toBe("true");
  const archivedCard = screen.getByText(archivedPet.name).closest("article")!;
  expect(within(archivedCard).getByText("Archived")).toBeTruthy();
  expect(
    within(archivedCard).getByText("Memories and records stay saved.")
  ).toBeTruthy();
  expect(within(archivedCard).getByRole("link", { name: "Enable Profile" })).toBeTruthy();

  const allTab = within(tabList).getByRole("tab", { name: "All" });
  fireEvent.click(allTab);
  expect(allTab.getAttribute("aria-selected")).toBe("true");
  for (const pet of [activePet, privatePet, memorialPet, archivedPet]) {
    expect(screen.getByText(pet.name)).toBeTruthy();
  }

  await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
});
